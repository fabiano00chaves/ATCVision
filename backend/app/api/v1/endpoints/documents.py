from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin, get_current_user
from app.core.config import settings
from app.db.models import OccurrencePdfMapping, PdfDocument, User
from app.db.session import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.document import PdfDocumentOut, UploadResult, UploadResultItem
from app.services.occurrence_service import ingest_pdf_file
from app.services.webhook_service import trigger_webhooks

router = APIRouter()


@router.post("/upload", response_model=UploadResult)
async def upload_documents(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results: List[UploadResultItem] = []

    for file in files:
        filename = os.path.basename(file.filename or "relatorio.pdf")
        # Validate magic bytes (%PDF-)
        header_bytes = await file.read(5)
        if not header_bytes.startswith(b"%PDF-"):
            results.append(
                UploadResultItem(
                    filename=filename,
                    status="error",
                    error="Arquivo inválido. Deve ser um PDF com cabeçalho válido (%PDF-).",
                )
            )
            continue

        await file.seek(0)
        # Limit max body size: 100 MB
        temp_path = settings.STORAGE_DIR / f"temp_{os.urandom(8).hex()}_{filename}"
        total_read = 0
        max_bytes = 100 * 1024 * 1024

        try:
            with open(temp_path, "wb") as f_out:
                while chunk := await file.read(65536):
                    total_read += len(chunk)
                    if total_read > max_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Arquivo {filename} excede o limite máximo de 100MB.",
                        )
                    f_out.write(chunk)

            doc, created, updated, st = await ingest_pdf_file(
                db, temp_path, filename, source="MANUAL_UPLOAD"
            )

            # Clean temp file if it's different from final storage
            if temp_path.exists() and doc and str(temp_path) != doc.storage_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

            doc_out = None
            if doc:
                # Count occurrences mapped to this document
                occ_cnt_res = await db.execute(
                    select(func.count(OccurrencePdfMapping.id)).where(
                        OccurrencePdfMapping.pdf_document_id == doc.id
                    )
                )
                occ_cnt = occ_cnt_res.scalar() or 0
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
                    occurrence_count=occ_cnt,
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
                            "source": "MANUAL_UPLOAD",
                        },
                    )

            results.append(
                UploadResultItem(
                    filename=filename,
                    status=st,
                    document=doc_out,
                    occurrences_created=created,
                    occurrences_updated=updated,
                )
            )

        except Exception as exc:
            if temp_path.exists():
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            results.append(
                UploadResultItem(
                    filename=filename,
                    status="error",
                    error=str(exc),
                )
            )

    return UploadResult(results=results)


@router.get("", response_model=PaginatedResponse[PdfDocumentOut])
async def list_documents(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_res = await db.execute(select(func.count(PdfDocument.id)))
    total = total_res.scalar() or 0

    query = (
        select(PdfDocument)
        .order_by(desc(PdfDocument.created_at))
        .limit(limit)
        .offset(offset)
    )
    docs_res = await db.execute(query)
    docs = docs_res.scalars().all()

    items: List[PdfDocumentOut] = []
    for d in docs:
        occ_cnt_res = await db.execute(
            select(func.count(OccurrencePdfMapping.id)).where(
                OccurrencePdfMapping.pdf_document_id == d.id
            )
        )
        occ_cnt = occ_cnt_res.scalar() or 0
        items.append(
            PdfDocumentOut(
                id=d.id,
                filename=d.filename,
                file_hash_sha256=d.file_hash_sha256,
                report_period_start=d.report_period_start,
                report_period_end=d.report_period_end,
                emitted_at=d.emitted_at,
                page_count=d.page_count,
                ocr_applied=d.ocr_applied,
                ingestion_source=d.ingestion_source,
                created_at=d.created_at,
                occurrence_count=occ_cnt,
                parse_warnings=d.parse_warnings or [],
                page_sizes=d.page_sizes or [],
            )
        )

    return PaginatedResponse(items=items, total=total)


@router.get("/{document_id}", response_model=PdfDocumentOut)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(PdfDocument).where(PdfDocument.id == document_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    occ_cnt_res = await db.execute(
        select(func.count(OccurrencePdfMapping.id)).where(
            OccurrencePdfMapping.pdf_document_id == doc.id
        )
    )
    occ_cnt = occ_cnt_res.scalar() or 0

    return PdfDocumentOut(
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
        occurrence_count=occ_cnt,
        parse_warnings=doc.parse_warnings or [],
        page_sizes=doc.page_sizes or [],
    )


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(PdfDocument).where(PdfDocument.id == document_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    # Serve OCR version if available, otherwise original
    file_path = doc.ocr_storage_path or doc.storage_path
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo binário do PDF não localizado no disco do servidor",
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=doc.filename,
        headers={"Content-Disposition": f'inline; filename="{doc.filename}"'},
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(PdfDocument).where(PdfDocument.id == document_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    # Delete disk files
    for p in (doc.storage_path, doc.ocr_storage_path):
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    await db.delete(doc)
    await db.commit()
    return {"ok": True, "message": "Documento e mapeamentos removidos com sucesso"}
