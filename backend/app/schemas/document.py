from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class PageSize(BaseModel):
    w: float
    h: float


class PdfDocumentOut(BaseModel):
    id: str
    filename: str
    file_hash_sha256: str
    report_period_start: Optional[datetime] = None
    report_period_end: Optional[datetime] = None
    emitted_at: Optional[datetime] = None
    page_count: int
    ocr_applied: bool
    ingestion_source: str
    created_at: datetime
    occurrence_count: int = 0
    parse_warnings: List[str] = []
    page_sizes: List[PageSize] = []

    model_config = {"from_attributes": True}


class UploadResultItem(BaseModel):
    filename: str
    status: str  # created | duplicate | error
    document: Optional[PdfDocumentOut] = None
    occurrences_created: int = 0
    occurrences_updated: int = 0
    error: Optional[str] = None


class UploadResult(BaseModel):
    results: List[UploadResultItem]
