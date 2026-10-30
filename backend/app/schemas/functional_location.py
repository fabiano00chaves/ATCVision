from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class FunctionalLocationBase(BaseModel):
    full_code: str
    parent_code: Optional[str] = None
    segment_code: str
    level: int
    description: Optional[str] = None
    custom_label: Optional[str] = None
    arvore_planta: Optional[str] = None
    occurrence_count: int = 0
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class FunctionalLocationNodeOut(FunctionalLocationBase):
    total_occurrences: int = 0
    children_count: int = 0
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class FunctionalLocationTreeNodeOut(FunctionalLocationNodeOut):
    children: List[FunctionalLocationTreeNodeOut] = []


class FunctionalLocationUpdate(BaseModel):
    custom_label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class FunctionalLocationRebuildOut(BaseModel):
    scanned_occurrences: int
    total_nodes: int
    max_depth: int
    message: str
    ok: bool = True
