from __future__ import annotations

import hashlib
import logging
from typing import Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token, hash_password
from app.db.models import ApiToken, User
from app.db.session import get_db

log = logging.getLogger("atc.auth")


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
        if x_api_key == settings.MASTER_API_KEY:
            # Synthetic admin user
            return User(id="master-api-key", email="api@vision.fk.adm.br", name="Master API Key", is_admin=True)

        token_hash = hashlib.sha256(x_api_key.encode("utf-8")).hexdigest()
        tok_res = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
        token_obj = tok_res.scalar_one_or_none()
        if token_obj:
            return User(id=token_obj.id, email=f"token-{token_obj.name}@vision.fk.adm.br", name=token_obj.name, is_admin=True)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chave de API inválida")

    # 2. Cloudflare Zero Trust Header (cf-access-authenticated-user-email)
    if settings.CLOUDFLARE_AUTH_ENABLED and cf_email and cf_email.strip():
        clean_email = cf_email.strip().lower()
        u_res = await db.execute(select(User).where(User.email == clean_email))
        cf_user = u_res.scalar_one_or_none()
        if not cf_user:
            name_part = clean_email.split("@")[0].replace(".", " ").title()
            cf_user = User(
                email=clean_email,
                name=f"{name_part}",
                hashed_password=hash_password("CloudflareZeroTrustPass"),
                is_admin=True,
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
    if authorization and authorization.startswith("Bearer "):
        jwt_token = authorization.split(" ")[1]
    elif atc_session:
        jwt_token = atc_session
        # CSRF check on state-changing methods authenticated by cookie
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if not x_atc_client or x_atc_client != "web":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Requisição rejeitada por política de segurança CSRF (header X-ATC-Client ausente)",
                )

    if jwt_token:
        user_id = decode_token(jwt_token)
        if user_id:
            u_res = await db.execute(select(User).where(User.id == user_id))
            user = u_res.scalar_one_or_none()
            if user:
                return user

    # 4. Auto-Login Fallback (Protected by Cloudflare Access or internal intranet)
    if settings.AUTO_LOGIN_ENABLED:
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
