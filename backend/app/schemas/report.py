from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ReportTemplateOut(BaseModel):
    id: str
    name: str
    description: str
    selected_fields: List[str]
    grouping_field: str
    include_atc_comments: bool
    header_title: str
    export_format_default: str

    model_config = {"from_attributes": True}


class ReportTemplateCreate(BaseModel):
    name: str
    description: str = ""
    selected_fields: List[str] = []
    grouping_field: str = "arvore_planta"
    include_atc_comments: bool = True
    header_title: str = "ATC Vision — Relatório de Confiabilidade"
    export_format_default: str = "pdf"


class ReportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    selected_fields: Optional[List[str]] = None
    grouping_field: Optional[str] = None
    include_atc_comments: Optional[bool] = None
    header_title: Optional[str] = None
    export_format_default: Optional[str] = None


class ReportFieldOut(BaseModel):
    key: str
    label: str
    default: bool = False


class GenerateReportRequest(BaseModel):
    template_id: Optional[str] = None
    selected_fields: Optional[List[str]] = None
    grouping_field: Optional[str] = None
    include_atc_comments: Optional[bool] = None
    header_title: Optional[str] = None
    format: str = "pdf"  # pdf | xlsx | csv | whatsapp | markdown
    scope: str = "all"  # relevant_or_analyze | relevant | analyze | all
    filters: Dict[str, Any] = {}
    occurrence_ids: Optional[List[str]] = None


class TextReportResponse(BaseModel):
    text: str
    count: int
