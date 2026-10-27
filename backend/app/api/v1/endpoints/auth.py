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


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
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
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )

    return LoginResponse(user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    return {"ok": True, "message": "Sessão encerrada"}


@router.get("/me", response_model=UserOut)
async def get_me(
    response: Response,
    current_user: User = Depends(get_current_user),
    atc_session: Optional[str] = Cookie(None),
):
    if not atc_session and current_user and getattr(current_user, "id", None) and current_user.id != "default-admin":
        access_token = create_access_token(
            subject=current_user.id,
            expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        response.set_cookie(
            key=settings.COOKIE_NAME,
            value=access_token,
            max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,
            path="/",
        )
    return UserOut.model_validate(current_user)
