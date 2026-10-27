from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class SettingsPayload(BaseModel):
    daily_cutoff_start: str = "06:00"
    daily_cutoff_end: str = "06:00"
    default_home: str = "daily"
    timezone: str = "America/Sao_Paulo"
    watch_folder_enabled: bool = True
    watch_folder_path: str = "/opt/atc-vision/data/inbox"
    ocr_enabled: bool = True
    ocr_min_chars_per_page: int = 40
    bad_actor_default_days: int = 7
    specialty_rules: Dict[str, List[str]] = {
        "ELETRICA": ["STGEET", "ELET", "AUTOM", "058/AT00"],
        "MECANICA": ["STGEMT", "MEC", "184/AT00", "068/AT00"],
    }


class ApiTokenOut(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ApiTokenCreate(BaseModel):
    name: str


class ApiTokenCreatedOut(BaseModel):
    token: str
    item: ApiTokenOut


class WebhookOut(BaseModel):
    id: str
    name: str
    target_url: str
    events: List[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookCreate(BaseModel):
    name: str
    target_url: str
    events: List[str] = ["document.ingested"]
    is_active: bool = True


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class DailyWindowOut(BaseModel):
    start: str
    end: str
    label: str


class FacetsOut(BaseModel):
    planning_groups: List[str] = []
    arvores: List[str] = []
    turnos: List[str] = []
    reportado_por: List[Dict[str, str]] = []
    tipos: List[str] = []
    tags: List[str] = []
