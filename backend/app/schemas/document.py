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
    file_size_bytes: int = 0
    has_binary: bool = True
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


class DocumentStatsOut(BaseModel):
    total_documents: int
    total_storage_bytes: int
    total_purged_documents: int
    total_occurrences: int
    oldest_report_date: Optional[datetime] = None
    newest_report_date: Optional[datetime] = None


class DocumentCleanupRequest(BaseModel):
    document_ids: Optional[List[str]] = None
    older_than_days: Optional[int] = None
    before_date: Optional[str] = None
    action: str = "purge_binaries"  # "purge_binaries" | "delete_complete"
    delete_occurrences: bool = True


class DocumentPreviewItem(BaseModel):
    id: str
    filename: str
    file_size_bytes: int
    occurrence_count: int
    has_binary: bool
    report_period_start: Optional[datetime] = None
    emitted_at: Optional[datetime] = None


class DocumentCleanupPreviewOut(BaseModel):
    documents_count: int
    total_bytes_to_free: int
    occurrences_affected: int
    documents: List[DocumentPreviewItem]


class DocumentCleanupResultOut(BaseModel):
    documents_affected: int
    bytes_freed: int
    occurrences_deleted: int
    occurrences_preserved: int
    message: str
