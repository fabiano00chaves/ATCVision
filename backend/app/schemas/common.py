from __future__ import annotations

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int


class MessageResponse(BaseModel):
    message: str
    ok: bool = True
