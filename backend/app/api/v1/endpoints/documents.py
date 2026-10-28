from __future__ import annotations

import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin, get_current_user
from app.core.config import settings
from app.db.models import Occurrence, OccurrencePdfMapping, PdfDocument, User
from app.db.session import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.document import (
    DocumentCleanupPreviewOut,
    DocumentCleanupRequest,
    DocumentCleanupResultOut,
    DocumentPreviewItem,
    DocumentStatsOut,
    PdfDocumentOut,
    UploadResult,
    UploadResultItem,
)
from app.services.occurrence_service import ingest_pdf_file
from app.services.webhook_service import trigger_webhooks

router = APIRouter()


def get_doc_file_info(doc: PdfDocument) -> tuple[bool, int]:
    has_binary = False
    size = 0
    for p in (doc.storage_path, doc.ocr_storage_path):
        if p and os.path.exists(p):
            has_binary = True
            try:
                size += os.path.getsize(p)
            except OSError:
                pass
    return has_binary, size


def purge_doc_disk_files(doc: PdfDocument) -> int:
    freed = 0
    for p in (doc.storage_path, doc.ocr_storage_path):
        if p and os.path.exists(p):
            try:
                freed += os.path.getsize(p)
                os.remove(p)
            except OSError:
                pass
    return freed


def format_bytes(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    elif num_bytes < 1024 * 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
    return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"


async def remove_document_occurrences(db: AsyncSession, doc_id: str) -> int:
    map_res = await db.execute(
        select(OccurrencePdfMapping.occurrence_id).where(
            OccurrencePdfMapping.pdf_document_id == doc_id
        )
    )
    occ_ids = [r[0] for r in map_res.fetchall()]
    if not occ_ids:
        return 0

    other_maps_res = await db.execute(
        select(OccurrencePdfMapping.occurrence_id)
        .where(
            OccurrencePdfMapping.occurrence_id.in_(occ_ids),
            OccurrencePdfMapping.pdf_document_id != doc_id,
        )
        .distinct()
    )
    shared_occ_ids = set(r[0] for r in other_maps_res.fetchall())
    exclusive_occ_ids = [oid for oid in occ_ids if oid not in shared_occ_ids]

    deleted_count = 0
    if exclusive_occ_ids:
        del_res = await db.execute(
            delete(Occurrence).where(Occurrence.id.in_(exclusive_occ_ids))
        )
        deleted_count = del_res.rowcount or len(exclusive_occ_ids)

    return deleted_count


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
                occ_cnt_res = await db.execute(
                    select(func.count(OccurrencePdfMapping.id)).where(
                        OccurrencePdfMapping.pdf_document_id == doc.id
                    )
                )
                occ_cnt = occ_cnt_res.scalar() or 0
                has_bin, sz = get_doc_file_info(doc)
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
                    file_size_bytes=sz,
                    has_binary=has_bin,
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


@router.get("/stats", response_model=DocumentStatsOut)
async def get_document_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs_res = await db.execute(select(PdfDocument))
    docs = docs_res.scalars().all()

    total_docs = len(docs)
    total_bytes = 0
    purged_docs = 0
    oldest_date: Optional[datetime] = None
    newest_date: Optional[datetime] = None

    for d in docs:
        has_bin, sz = get_doc_file_info(d)
        if has_bin:
            total_bytes += sz
        else:
            purged_docs += 1

        dt = d.report_period_start or d.emitted_at or d.created_at
        if dt:
            dt_cmp = dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt
            if oldest_date is None or dt_cmp < oldest_date:
                oldest_date = dt_cmp
            if newest_date is None or dt_cmp > newest_date:
                newest_date = dt_cmp

    occ_cnt_res = await db.execute(select(func.count(Occurrence.id)))
    total_occs = occ_cnt_res.scalar() or 0

    return DocumentStatsOut(
        total_documents=total_docs,
        total_storage_bytes=total_bytes,
        total_purged_documents=purged_docs,
        total_occurrences=total_occs,
        oldest_report_date=oldest_date,
        newest_report_date=newest_date,
    )


@router.post("/cleanup/preview", response_model=DocumentCleanupPreviewOut)
async def preview_document_cleanup(
    req: DocumentCleanupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PdfDocument)
    if req.document_ids:
        query = query.where(PdfDocument.id.in_(req.document_ids))
    elif req.before_date:
        try:
            b_dt = datetime.fromisoformat(req.before_date)
            query = query.where(
                or_(
                    PdfDocument.report_period_start <= b_dt,
                    PdfDocument.emitted_at <= b_dt,
                    PdfDocument.created_at <= b_dt,
                )
            )
        except ValueError:
            pass
    elif req.older_than_days and req.older_than_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=req.older_than_days)
        query = query.where(PdfDocument.created_at <= cutoff)

    res = await db.execute(query.order_by(desc(PdfDocument.created_at)))
    docs = res.scalars().all()

    items: List[DocumentPreviewItem] = []
    total_bytes = 0
    total_occs = 0

    for d in docs:
        has_bin, sz = get_doc_file_info(d)
        occ_cnt_res = await db.execute(
            select(func.count(OccurrencePdfMapping.id)).where(
                OccurrencePdfMapping.pdf_document_id == d.id
            )
        )
        occ_cnt = occ_cnt_res.scalar() or 0
        total_bytes += sz
        total_occs += occ_cnt
        items.append(
            DocumentPreviewItem(
                id=d.id,
                filename=d.filename,
                file_size_bytes=sz,
                occurrence_count=occ_cnt,
                has_binary=has_bin,
                report_period_start=d.report_period_start,
                emitted_at=d.emitted_at,
            )
        )

    return DocumentCleanupPreviewOut(
        documents_count=len(docs),
        total_bytes_to_free=total_bytes,
        occurrences_affected=total_occs,
        documents=items,
    )


@router.post("/cleanup", response_model=DocumentCleanupResultOut)
async def execute_document_cleanup(
    req: DocumentCleanupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PdfDocument)
    if req.document_ids:
        query = query.where(PdfDocument.id.in_(req.document_ids))
    elif req.before_date:
        try:
            b_dt = datetime.fromisoformat(req.before_date)
            query = query.where(
                or_(
                    PdfDocument.report_period_start <= b_dt,
                    PdfDocument.emitted_at <= b_dt,
                    PdfDocument.created_at <= b_dt,
                )
            )
        except ValueError:
            pass
    elif req.older_than_days and req.older_than_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=req.older_than_days)
        query = query.where(PdfDocument.created_at <= cutoff)

    res = await db.execute(query)
    docs = res.scalars().all()

    if not docs:
        return DocumentCleanupResultOut(
            documents_affected=0,
            bytes_freed=0,
            occurrences_deleted=0,
            occurrences_preserved=0,
            message="Nenhum documento encontrado para os critérios selecionados.",
        )

    bytes_freed = 0
    occs_deleted = 0
    occs_preserved = 0

    if req.action == "purge_binaries":
        # Delete ONLY physical files from disk, PRESERVE documents and occurrences in DB!
        for d in docs:
            freed = purge_doc_disk_files(d)
            bytes_freed += freed
            occ_cnt_res = await db.execute(
                select(func.count(OccurrencePdfMapping.id)).where(
                    OccurrencePdfMapping.pdf_document_id == d.id
                )
            )
            occs_preserved += occ_cnt_res.scalar() or 0
        message = (
            f"Otimização concluída: {len(docs)} arquivo(s) PDF liberado(s) do disco "
            f"({format_bytes(bytes_freed)} liberados). {occs_preserved} ocorrência(s) preservada(s) intactas no banco de dados."
        )

    else:  # delete_complete
        for d in docs:
            freed = purge_doc_disk_files(d)
            bytes_freed += freed
            if req.delete_occurrences:
                del_cnt = await remove_document_occurrences(db, d.id)
                occs_deleted += del_cnt
            await db.delete(d)

        await db.commit()
        message = (
            f"Expurgo completo concluído: {len(docs)} documento(s) e {occs_deleted} ocorrência(s) "
            f"exclusiva(s) foram excluídos permanentemente ({format_bytes(bytes_freed)} liberados)."
        )

    return DocumentCleanupResultOut(
        documents_affected=len(docs),
        bytes_freed=bytes_freed,
        occurrences_deleted=occs_deleted,
        occurrences_preserved=occs_preserved,
        message=message,
    )


@router.get("", response_model=PaginatedResponse[PdfDocumentOut])
async def list_documents(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_res = await db.execute(select(func.count(PdfDocument.id)))
    total = total_res.scalar() or 0

    query = (
        select(PdfDocument)
        .order_by(PdfDocument.report_period_start.desc().nulls_last(), PdfDocument.created_at.desc())
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
        has_bin, sz = get_doc_file_info(d)
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
                file_size_bytes=sz,
                has_binary=has_bin,
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
    has_bin, sz = get_doc_file_info(doc)

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
        file_size_bytes=sz,
        has_binary=has_bin,
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
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo binário do PDF não localizado ou foi liberado para economia de espaço no servidor.",
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
    purge_only: bool = Query(False),
    delete_occurrences: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(PdfDocument).where(PdfDocument.id == document_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")

    freed = purge_doc_disk_files(doc)

    if purge_only:
        # Keep document record and occurrences in DB
        return {
            "ok": True,
            "message": f"Arquivo PDF físico removido do disco ({format_bytes(freed)} liberados). Ocorrências mantidas no sistema.",
            "bytes_freed": freed,
        }

    occs_deleted = 0
    if delete_occurrences:
        occs_deleted = await remove_document_occurrences(db, doc.id)

    await db.delete(doc)
    await db.commit()
    return {
        "ok": True,
        "message": f"Documento e {occs_deleted} ocorrência(s) exclusiva(s) excluídos ({format_bytes(freed)} liberados).",
        "bytes_freed": freed,
    }
