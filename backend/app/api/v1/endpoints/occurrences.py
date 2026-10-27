from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.models import (
    FilterPreset,
    Occurrence,
    OccurrenceComment,
    OccurrenceConfirmation,
    OccurrencePdfMapping,
    PdfDocument,
    User,
)
from app.db.session import get_db
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.occurrence import (
    CommentCreate,
    CommentOut,
    CommentUpdate,
    ConfirmationOut,
    MappingOut,
    NeighborsOut,
    OccurrenceCountsOut,
    OccurrenceDetailOut,
    OccurrencePatch,
    OccurrenceSummaryOut,
)
from app.services.occurrence_service import (
    apply_occurrence_filters,
    apply_occurrence_sorting,
)

router = APIRouter()


def build_summary_out(occ: Occurrence) -> OccurrenceSummaryOut:
    doc_ids = [m.pdf_document_id for m in (occ.mappings or [])]
    return OccurrenceSummaryOut(
        id=occ.id,
        unique_sap_key=occ.unique_sap_key,
        tipo_ocorrencia=occ.tipo_ocorrencia,
        numero_nota=occ.numero_nota,
        numero_ordem=occ.numero_ordem,
        titulo=occ.titulo,
        status_ordem=occ.status_ordem,
        prioridade_sap=occ.prioridade_sap,
        data_abertura=occ.data_abertura,
        hora_abertura=occ.hora_abertura,
        abertura_timestamp=occ.abertura_timestamp,
        turno=occ.turno,
        grupo_planejamento=occ.grupo_planejamento,
        reportado_por_id=occ.reportado_por_id,
        reportado_por_nome=occ.reportado_por_nome,
        especialidade=occ.especialidade,
        posicao_funcional=occ.posicao_funcional,
        arvore_planta=occ.arvore_planta,
        descricao_posicao_funcional=occ.descricao_posicao_funcional,
        descricao_curta_objeto=occ.descricao_curta_objeto,
        teve_pane=occ.teve_pane,
        duracao_pane_min=occ.duracao_pane_min,
        duracao_avaria_min=occ.duracao_avaria_min,
        tem_jump_force=occ.tem_jump_force,
        jump_status=occ.jump_status,
        hh_total_minutos=occ.hh_total_minutos,
        quantidade_executantes=occ.quantidade_executantes,
        flag_analisar=occ.flag_analisar,
        flag_relevante=occ.flag_relevante,
        status_atc=occ.status_atc,
        prioridade_atc=occ.prioridade_atc,
        tags_customizadas=occ.tags_customizadas or [],
        comment_count=len(occ.comments) if occ.comments else 0,
        snippet=None,
        document_ids=doc_ids,
        primary_document_id=doc_ids[0] if doc_ids else None,
        detalhe_jump_tarefas=occ.detalhe_jump_tarefas,
    )


@router.get("", response_model=PaginatedResponse[OccurrenceSummaryOut])
async def list_occurrences(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: Optional[str] = Query("abertura_desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    base_query = select(Occurrence).options(
        selectinload(Occurrence.mappings),
        selectinload(Occurrence.comments),
    )

    filtered_query = await apply_occurrence_filters(base_query, filters, db)

    # Count total
    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    sorted_query = apply_occurrence_sorting(filtered_query, sort).limit(limit).offset(offset)
    results = await db.execute(sorted_query)
    occurrences = results.scalars().all()

    items = [build_summary_out(o) for o in occurrences]
    return PaginatedResponse(items=items, total=total)


@router.get("/counts", response_model=OccurrenceCountsOut)
async def get_occurrence_counts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    # Remove preset_id from global filters for counting individual presets
    filters.pop("preset_id", None)

    # 1. Base total count for current time window / filters
    base_query = select(Occurrence)
    filtered_base = await apply_occurrence_filters(base_query, dict(filters), db)
    total_res = await db.execute(select(func.count()).select_from(filtered_base.subquery()))
    total = total_res.scalar() or 0

    # 2. Count for each preset configured in quickbar
    presets_res = await db.execute(select(FilterPreset).where(FilterPreset.show_in_quickbar.is_(True)))
    presets = presets_res.scalars().all()

    preset_counts = []
    for p in presets:
        p_filters = dict(filters)
        p_filters["preset_id"] = p.id
        p_query = await apply_occurrence_filters(select(Occurrence), p_filters, db)
        p_cnt_res = await db.execute(select(func.count()).select_from(p_query.subquery()))
        p_cnt = p_cnt_res.scalar() or 0
        preset_counts.append({"preset_id": p.id, "count": p_cnt})

    return OccurrenceCountsOut(total=total, presets=preset_counts)


@router.get("/{occurrence_id}", response_model=OccurrenceDetailOut)
async def get_occurrence_detail(
    occurrence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.confirmations),
            selectinload(Occurrence.comments),
            selectinload(Occurrence.mappings).selectinload(OccurrencePdfMapping.document),
        )
        .where(Occurrence.id == occurrence_id)
    )
    res = await db.execute(query)
    occ = res.scalar_one_or_none()
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada")

    doc_ids = [m.pdf_document_id for m in (occ.mappings or [])]

    mappings_out = []
    for m in occ.mappings or []:
        mappings_out.append(
            MappingOut(
                id=m.id,
                pdf_document_id=m.pdf_document_id,
                document_filename=m.document.filename if m.document else "relatorio.pdf",
                report_period_start=m.document.report_period_start if m.document else None,
                report_period_end=m.document.report_period_end if m.document else None,
                start_page=m.start_page,
                end_page=m.end_page,
                page_sizes=m.document.page_sizes if m.document else [],
                field_bboxes=m.field_bboxes or {},
            )
        )

    confirmations_out = [
        ConfirmationOut(
            id=c.id,
            data_execucao=c.data_execucao,
            hora_execucao=c.hora_execucao,
            centro_trabalho=c.centro_trabalho,
            matricula=c.matricula,
            nome_executante=c.nome_executante,
            duracao_min=c.duracao_min,
        )
        for c in occ.confirmations or []
    ]

    comments_out = [
        CommentOut(
            id=c.id,
            author_name=c.author_name,
            comment_text=c.comment_text,
            is_action_item=c.is_action_item,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in occ.comments or []
    ]

    return OccurrenceDetailOut(
        id=occ.id,
        unique_sap_key=occ.unique_sap_key,
        tipo_ocorrencia=occ.tipo_ocorrencia,
        numero_nota=occ.numero_nota,
        numero_ordem=occ.numero_ordem,
        titulo=occ.titulo,
        status_ordem=occ.status_ordem,
        prioridade_sap=occ.prioridade_sap,
        data_abertura=occ.data_abertura,
        hora_abertura=occ.hora_abertura,
        abertura_timestamp=occ.abertura_timestamp,
        turno=occ.turno,
        grupo_planejamento=occ.grupo_planejamento,
        reportado_por_id=occ.reportado_por_id,
        reportado_por_nome=occ.reportado_por_nome,
        especialidade=occ.especialidade,
        posicao_funcional=occ.posicao_funcional,
        arvore_planta=occ.arvore_planta,
        descricao_posicao_funcional=occ.descricao_posicao_funcional,
        descricao_curta_objeto=occ.descricao_curta_objeto,
        teve_pane=occ.teve_pane,
        duracao_pane_min=occ.duracao_pane_min,
        duracao_avaria_min=occ.duracao_avaria_min,
        tem_jump_force=occ.tem_jump_force,
        jump_status=occ.jump_status,
        hh_total_minutos=occ.hh_total_minutos,
        quantidade_executantes=occ.quantidade_executantes,
        flag_analisar=occ.flag_analisar,
        flag_relevante=occ.flag_relevante,
        status_atc=occ.status_atc,
        prioridade_atc=occ.prioridade_atc,
        tags_customizadas=occ.tags_customizadas or [],
        comment_count=len(occ.comments) if occ.comments else 0,
        snippet=None,
        document_ids=doc_ids,
        primary_document_id=doc_ids[0] if doc_ids else None,
        detalhe_jump_tarefas=occ.detalhe_jump_tarefas,
        descricao_longa_notificacao=occ.descricao_longa_notificacao,
        descricao_longa_ordem=occ.descricao_longa_ordem,
        texto_confirmacao=occ.texto_confirmacao,
        defeito=occ.defeito,
        causa=occ.causa,
        observacoes_objeto=occ.observacoes_objeto,
        equipamento_codigo=occ.equipamento_codigo,
        equipamento_descricao=occ.equipamento_descricao,
        inicio_avaria=occ.inicio_avaria,
        fim_avaria=occ.fim_avaria,
        jump_retirado_em=occ.jump_retirado_em,
        operacoes=occ.operacoes or [],
        objetos=occ.objetos or [],
        confirmations=confirmations_out,
        comments=comments_out,
        mappings=mappings_out,
        created_at=occ.created_at,
        updated_at=occ.updated_at,
    )


@router.patch("/{occurrence_id}", response_model=OccurrenceDetailOut)
async def patch_occurrence(
    occurrence_id: str,
    payload: OccurrencePatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.confirmations),
            selectinload(Occurrence.comments),
            selectinload(Occurrence.mappings).selectinload(OccurrencePdfMapping.document),
        )
        .where(Occurrence.id == occurrence_id)
    )
    res = await db.execute(query)
    occ = res.scalar_one_or_none()
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada")

    if payload.flag_analisar is not None:
        occ.flag_analisar = payload.flag_analisar
    if payload.flag_relevante is not None:
        occ.flag_relevante = payload.flag_relevante
    if payload.status_atc is not None:
        occ.status_atc = payload.status_atc
    if payload.prioridade_atc is not None:
        occ.prioridade_atc = payload.prioridade_atc
    if payload.tags_customizadas is not None:
        occ.tags_customizadas = payload.tags_customizadas
    if payload.jump_status is not None:
        occ.jump_status = payload.jump_status
        if payload.jump_status == "RETIRADO":
            occ.jump_retirado_em = datetime.now(timezone.utc)
        elif payload.jump_status == "PENDENTE":
            occ.jump_retirado_em = None

    await db.commit()
    await db.refresh(occ)

    return await get_occurrence_detail(occurrence_id, db, current_user)


@router.get("/{occurrence_id}/neighbors", response_model=NeighborsOut)
async def get_occurrence_neighbors(
    occurrence_id: str,
    request: Request,
    sort: Optional[str] = Query("abertura_desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    filters.pop("sort", None)

    base_query = select(Occurrence.id)
    filtered = await apply_occurrence_filters(base_query, filters, db)
    sorted_q = apply_occurrence_sorting(filtered, sort)

    res = await db.execute(sorted_q)
    all_ids = [row[0] for row in res.all()]

    if occurrence_id not in all_ids:
        return NeighborsOut(prev_id=None, next_id=None)

    idx = all_ids.index(occurrence_id)
    prev_id = all_ids[idx - 1] if idx > 0 else None
    next_id = all_ids[idx + 1] if idx < len(all_ids) - 1 else None
    return NeighborsOut(prev_id=prev_id, next_id=next_id)


# ---------- Comments Sub-Router ----------

@router.get("/{occurrence_id}/comments", response_model=List[CommentOut])
async def list_comments(
    occurrence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(OccurrenceComment)
        .where(OccurrenceComment.occurrence_id == occurrence_id)
        .order_by(OccurrenceComment.created_at.desc())
    )
    comments = res.scalars().all()
    return [CommentOut.model_validate(c) for c in comments]


@router.post("/{occurrence_id}/comments", response_model=CommentOut)
async def add_comment(
    occurrence_id: str,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ_res = await db.execute(select(Occurrence).where(Occurrence.id == occurrence_id))
    if not occ_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ocorrência não encontrada")

    new_comment = OccurrenceComment(
        occurrence_id=occurrence_id,
        author_id=current_user.id,
        author_name=current_user.name,
        comment_text=payload.comment_text.strip(),
        is_action_item=payload.is_action_item,
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    return CommentOut.model_validate(new_comment)


# Direct comment endpoints for update/delete
comment_router = APIRouter()


@comment_router.patch("/{comment_id}", response_model=CommentOut)
async def update_comment(
    comment_id: str,
    payload: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(OccurrenceComment).where(OccurrenceComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentário não encontrado")

    if not current_user.is_admin and comment.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão negada para editar este comentário")

    if payload.comment_text is not None:
        comment.comment_text = payload.comment_text.strip()
    if payload.is_action_item is not None:
        comment.is_action_item = payload.is_action_item

    await db.commit()
    await db.refresh(comment)
    return CommentOut.model_validate(comment)


@comment_router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(OccurrenceComment).where(OccurrenceComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentário não encontrado")

    if not current_user.is_admin and comment.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão negada para excluir este comentário")

    await db.delete(comment)
    await db.commit()
    return {"ok": True, "message": "Comentário removido"}
