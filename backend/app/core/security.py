from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import settings

# Argon2id hasher with high resistance to side-channel and GPU cracking
_pwd_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64MB
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

security_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _pwd_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _pwd_hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": str(subject), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except (jwt.PyJWTError, ValueError):
        return None


def generate_secure_token() -> str:
    return secrets.token_urlsafe(32)
