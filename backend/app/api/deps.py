from __future__ import annotations

import hashlib
from typing import Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token
from app.db.models import ApiToken, User
from app.db.session import get_db


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    atc_session: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    x_atc_client: Optional[str] = Header(None),
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

    # 2. Bearer Token Auth
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

    if not jwt_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    user_id = decode_token(jwt_token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada ou inválida")

    u_res = await db.execute(select(User).where(User.id == user_id))
    user = u_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return current_user
