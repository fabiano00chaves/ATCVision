from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FilterPayload(BaseModel):
    functional_locations_prefixes: List[str] = []
    planning_groups: List[str] = []
    specialties: List[str] = []
    reportado_por_ids: List[str] = []
    keywords: List[str] = []
    tipos: List[str] = []
    arvores: List[str] = []
    turnos: List[str] = []
    status_atc: List[str] = []
    fl_desc: Optional[str] = None
    only_pane: bool = False
    only_jump: bool = False
    only_relevant: bool = False
    only_analyze: bool = False

    model_config = {"extra": "allow"}


class PresetCreate(BaseModel):
    name: str
    icon: str = "Filter"
    color: str = "#3b82f6"
    is_default: bool = False
    show_in_quickbar: bool = True
    sort_order: int = 0
    filter_payload: Dict[str, Any] = {}


class PresetUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: Optional[bool] = None
    show_in_quickbar: Optional[bool] = None
    sort_order: Optional[int] = None
    filter_payload: Optional[Dict[str, Any]] = None


class PresetOut(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    is_default: bool
    show_in_quickbar: bool
    sort_order: int
    filter_payload: Dict[str, Any]

    model_config = {"from_attributes": True}
