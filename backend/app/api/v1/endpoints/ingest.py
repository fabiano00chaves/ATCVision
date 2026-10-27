from __future__ import annotations

import base64
import os
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import User
from app.db.session import get_db
from app.schemas.document import PdfDocumentOut, UploadResult, UploadResultItem
from app.services.occurrence_service import ingest_pdf_file
from app.services.webhook_service import trigger_webhooks

router = APIRouter()


class JsonIngestPayload(BaseModel):
    filename: str
    content_base64: str


@router.post("", response_model=UploadResult)
async def ingest_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: Optional[UploadFile] = File(None),
):
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        try:
            body = await request.json()
            payload = JsonIngestPayload(**body)
            pdf_bytes = base64.b64decode(payload.content_base64)
            filename = os.path.basename(payload.filename)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"JSON inválido para ingestão: {exc}",
            )

        if not pdf_bytes.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Conteúdo base64 não é um arquivo PDF válido.",
            )

        temp_path = settings.STORAGE_DIR / f"api_ingest_{os.urandom(8).hex()}_{filename}"
        with open(temp_path, "wb") as f_out:
            f_out.write(pdf_bytes)

        doc, created, updated, st = await ingest_pdf_file(
            db, temp_path, filename, source="WEBHOOK_API"
        )

        doc_out = None
        if doc:
            doc_out = PdfDocumentOut(
                id=doc.id,
                filename=doc.filename,
                file_hash_sha256=doc.file_hash_sha256,
                report_period_start=doc.report_period_start,
                report_period_end=doc.report_period_end,
                emitted_at=doc.emitted_at,
                page_count=doc.page_count,
                ocr_applied=doc.ocr_applied,
                ingestion_source=doc.ingestion_source,
                created_at=doc.created_at,
                occurrence_count=created + updated,
                parse_warnings=doc.parse_warnings or [],
                page_sizes=doc.page_sizes or [],
            )
            if st == "created":
                await trigger_webhooks(
                    db,
                    "document.ingested",
                    {
                        "document_id": doc.id,
                        "filename": doc.filename,
                        "occurrences_created": created,
                        "occurrences_updated": updated,
                        "source": "WEBHOOK_API",
                    },
                )

        return UploadResult(
            results=[
                UploadResultItem(
                    filename=filename,
                    status=st,
                    document=doc_out,
                    occurrences_created=created,
                    occurrences_updated=updated,
                )
            ]
        )

    elif file:
        filename = os.path.basename(file.filename or "relatorio.pdf")
        header = await file.read(5)
        if not header.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arquivo fornecido não é um PDF válido.",
            )
        await file.seek(0)
        temp_path = settings.STORAGE_DIR / f"api_ingest_{os.urandom(8).hex()}_{filename}"
        with open(temp_path, "wb") as f_out:
            while chunk := await file.read(65536):
                f_out.write(chunk)

        doc, created, updated, st = await ingest_pdf_file(
            db, temp_path, filename, source="WEBHOOK_API"
        )

        doc_out = None
        if doc:
            doc_out = PdfDocumentOut(
                id=doc.id,
                filename=doc.filename,
                file_hash_sha256=doc.file_hash_sha256,
                report_period_start=doc.report_period_start,
                report_period_end=doc.report_period_end,
                emitted_at=doc.emitted_at,
                page_count=doc.page_count,
                ocr_applied=doc.ocr_applied,
                ingestion_source=doc.ingestion_source,
                created_at=doc.created_at,
                occurrence_count=created + updated,
                parse_warnings=doc.parse_warnings or [],
                page_sizes=doc.page_sizes or [],
            )
            if st == "created":
                await trigger_webhooks(
                    db,
                    "document.ingested",
                    {
                        "document_id": doc.id,
                        "filename": doc.filename,
                        "occurrences_created": created,
                        "occurrences_updated": updated,
                        "source": "WEBHOOK_API",
                    },
                )

        return UploadResult(
            results=[
                UploadResultItem(
                    filename=filename,
                    status=st,
                    document=doc_out,
                    occurrences_created=created,
                    occurrences_updated=updated,
                )
            ]
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie um arquivo PDF multipart ou um JSON com content_base64 e filename.",
        )
