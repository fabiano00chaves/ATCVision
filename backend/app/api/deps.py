from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
import jwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token, hash_password
from app.db.models import ApiToken, User
from app.db.session import get_db

log = logging.getLogger("atc.auth")


_jwks_clients: dict[str, PyJWKClient] = {}


def get_jwks_client(team_domain: str) -> PyJWKClient:
    if team_domain not in _jwks_clients:
        certs_url = f"https://{team_domain}.cloudflareaccess.com/cdn-cgi/access/certs"
        _jwks_clients[team_domain] = PyJWKClient(certs_url, cache_keys=True, max_cached_keys=16)
    return _jwks_clients[team_domain]


def verify_cloudflare_jwt(assertion: str, team_domain: Optional[str] = None, aud: Optional[str] = None) -> dict:
    """Verifies a Cloudflare Access JWT assertion.
    If team_domain is provided, fetches JWKS and validates signature, exp, and aud.
    Otherwise, decodes token claims for validation.
    """
    if team_domain:
        jwks_client = get_jwks_client(team_domain)
        signing_key = jwks_client.get_signing_key_from_jwt(assertion)
        decode_kwargs = {
            "algorithms": ["RS256"],
            "options": {"verify_exp": True},
        }
        if aud:
            decode_kwargs["audience"] = aud
        else:
            decode_kwargs["options"]["verify_aud"] = False
        return jwt.decode(assertion, signing_key.key, **decode_kwargs)
    else:
        return jwt.decode(assertion, options={"verify_signature": False})


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    atc_session: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    x_atc_client: Optional[str] = Header(None),
    cf_email: Optional[str] = Header(None, alias="cf-access-authenticated-user-email"),
) -> User:
    # 1. API Key Auth (for external automations / webhooks)
    if x_api_key:
        if settings.MASTER_API_KEY and secrets.compare_digest(x_api_key, settings.MASTER_API_KEY):
            request.state.auth_method = "api_key"
            # Synthetic admin user
            return User(id="master-api-key", email="api@vision.fk.adm.br", name="Master API Key", is_admin=True)

        token_hash = hashlib.sha256(x_api_key.encode("utf-8")).hexdigest()
        tok_res = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
        token_obj = tok_res.scalar_one_or_none()
        if token_obj:
            token_obj.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            request.state.auth_method = "api_key"
            return User(id=token_obj.id, email=f"token-{token_obj.name}@vision.fk.adm.br", name=token_obj.name, is_admin=True)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chave de API inválida")

    # 2. Cloudflare Zero Trust Header (cf-access-authenticated-user-email)
    cf_jwt = request.headers.get("cf-access-jwt-assertion")
    if settings.CLOUDFLARE_AUTH_ENABLED and cf_email and cf_email.strip():
        # If team domain is configured, cryptographic verification is MANDATORY
        if settings.CLOUDFLARE_ACCESS_TEAM_DOMAIN:
            if not cf_jwt:
                log.warning("Cloudflare Access JWT assertion missing from %s", request.client)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Requisição Cloudflare Access rejeitada por ausência de token JWT criptográfico (cf-access-jwt-assertion).",
                )
            try:
                claims = verify_cloudflare_jwt(
                    cf_jwt,
                    team_domain=settings.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
                    aud=settings.CLOUDFLARE_ACCESS_AUD,
                )
                token_email = (claims.get("email") or claims.get("sub") or "").strip().lower()
                if token_email and token_email != cf_email.strip().lower():
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="E-mail do cabeçalho diverge da identidade validada no token Cloudflare Access.",
                    )
            except HTTPException:
                raise
            except Exception as e:
                log.warning("Invalid Cloudflare Access JWT assertion: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token Cloudflare Access inválido ou expirado.",
                )
        elif settings.ENVIRONMENT == "production":
            # In production without team domain configured, require edge evidence
            has_cf_evidence = bool(
                request.headers.get("cf-ray")
                or cf_jwt
                or getattr(request.state, "cf_ray", None)
            )
            if not has_cf_evidence:
                log.warning("Rejected cf-access email header without Cloudflare proxy assertion from %s", request.client)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Requisição Cloudflare Access rejeitada por ausência de prova de borda (CF-Ray/CF-JWT).",
                )
            if cf_jwt:
                try:
                    claims = verify_cloudflare_jwt(cf_jwt)
                    token_email = (claims.get("email") or claims.get("sub") or "").strip().lower()
                    if token_email and token_email != cf_email.strip().lower():
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="E-mail do cabeçalho diverge da identidade validada no token Cloudflare Access.",
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    log.warning("Malformed Cloudflare Access JWT assertion: %s", e)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Token Cloudflare Access malformado.",
                    )

        clean_email = cf_email.strip().lower()
        u_res = await db.execute(select(User).where(User.email == clean_email))
        cf_user = u_res.scalar_one_or_none()
        if not cf_user:
            name_part = clean_email.split("@")[0].replace(".", " ").title()
            is_adm = (clean_email == settings.ADMIN_EMAIL.lower())
            cf_user = User(
                email=clean_email,
                name=f"{name_part}",
                hashed_password=hash_password(secrets.token_urlsafe(32)),
                is_admin=is_adm,
            )
            db.add(cf_user)
            try:
                await db.commit()
                await db.refresh(cf_user)
            except Exception:
                await db.rollback()
                u_res = await db.execute(select(User).where(User.email == clean_email))
                cf_user = u_res.scalar_one_or_none() or cf_user
        return cf_user

    # 3. Bearer Token Auth / Session Cookie
    jwt_token = None
    authenticated_via_cookie = False
    if authorization and authorization.startswith("Bearer "):
        jwt_token = authorization.split(" ")[1]
    elif atc_session:
        jwt_token = atc_session
        authenticated_via_cookie = True

    if jwt_token:
        # CSRF check on state-changing methods authenticated by cookie
        if authenticated_via_cookie and request.method not in ("GET", "HEAD", "OPTIONS"):
            if not x_atc_client or x_atc_client != "web":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Requisição rejeitada por política de segurança CSRF (header X-ATC-Client ausente)",
                )

        user_id = decode_token(jwt_token)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de sessão inválido ou expirado.",
            )

        u_res = await db.execute(select(User).where(User.id == user_id))
        user = u_res.scalar_one_or_none()
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário da sessão não encontrado no sistema.",
        )

    # 4. Auto-Login Fallback (Restricted exclusively to development/internal sandbox environments)
    if settings.AUTO_LOGIN_ENABLED and settings.ENVIRONMENT != "production":
        # CSRF check on state-changing methods authenticated via browser auto-login
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if not x_atc_client or x_atc_client != "web":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Requisição rejeitada por política de segurança CSRF (header X-ATC-Client ausente)",
                )

        # Busca usuário administrador padrão
        admin_res = await db.execute(select(User).where(User.is_admin == True).order_by(User.created_at.asc()))
        admin_user = admin_res.scalars().first()
        if not admin_user:
            admin_res = await db.execute(select(User).where(User.email == settings.ADMIN_EMAIL.lower()))
            admin_user = admin_res.scalar_one_or_none()
        if admin_user:
            return admin_user

        # Se ainda não houver nenhum no banco, provisiona o administrador padrão
        new_admin = User(
            email=settings.ADMIN_EMAIL,
            name=settings.ADMIN_NAME,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            is_admin=True,
        )
        db.add(new_admin)
        try:
            await db.commit()
            await db.refresh(new_admin)
            return new_admin
        except Exception:
            await db.rollback()
            return User(id="default-admin", email=settings.ADMIN_EMAIL, name=settings.ADMIN_NAME, is_admin=True)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return current_user
