from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    is_admin: bool

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserOut
    message: str = "Autenticado com sucesso"
