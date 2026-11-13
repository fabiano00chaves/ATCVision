from __future__ import annotations

from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginRequest, LoginResponse, UserOut

router = APIRouter()


def is_secure_request(request: Request) -> bool:
    if settings.COOKIE_SECURE is not None:
        return settings.COOKIE_SECURE
    proto = request.headers.get("x-forwarded-proto", "").lower()
    cf_visitor = request.headers.get("cf-visitor", "").lower()
    if proto == "https" or '"scheme":"https"' in cf_visitor or request.url.scheme == "https":
        return True
    if settings.ENVIRONMENT == "production":
        return True
    return False


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = res.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
        )

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=access_token,
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=is_secure_request(request),
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )

    return LoginResponse(user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(response: Response, request: Request):
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        httponly=True,
        secure=is_secure_request(request),
        samesite=settings.COOKIE_SAMESITE,
    )
    return {"ok": True, "message": "Sessão encerrada"}


@router.get("/me", response_model=UserOut)
async def get_me(
    response: Response,
    request: Request,
    current_user: User = Depends(get_current_user),
    atc_session: Optional[str] = Cookie(None),
):
    auth_method = getattr(request.state, "auth_method", None)
    is_api_key_user = (
        auth_method == "api_key"
        or (current_user and getattr(current_user, "id", None) in ("master-api-key", "default-admin"))
        or (current_user and getattr(current_user, "email", "").startswith("token-"))
    )

    if not atc_session and current_user and getattr(current_user, "id", None) and not is_api_key_user:
        access_token = create_access_token(
            subject=current_user.id,
            expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        response.set_cookie(
            key=settings.COOKIE_NAME,
            value=access_token,
            max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            httponly=True,
            secure=is_secure_request(request),
            samesite=settings.COOKIE_SAMESITE,
            path="/",
        )
    return UserOut.model_validate(current_user)
