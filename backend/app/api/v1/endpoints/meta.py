from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Request
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import Occurrence, User
from app.db.session import get_db
from app.schemas.setting import FacetsOut
from app.services.occurrence_service import apply_occurrence_filters

router = APIRouter()


@router.get("/facets", response_model=FacetsOut)
async def get_facets(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    base_query = select(Occurrence)
    filtered = await apply_occurrence_filters(base_query, filters, db)

    # Subquery for occurrences
    subq = filtered.subquery()

    # Distinct planning groups
    pg_res = await db.execute(
        select(distinct(subq.c.grupo_planejamento))
        .where(subq.c.grupo_planejamento.isnot(None))
        .order_by(subq.c.grupo_planejamento.asc())
    )
    planning_groups = [r[0] for r in pg_res.all() if r[0]]

    # Distinct arvores
    arv_res = await db.execute(
        select(distinct(subq.c.arvore_planta))
        .where(subq.c.arvore_planta.isnot(None))
        .order_by(subq.c.arvore_planta.asc())
    )
    arvores = [r[0] for r in arv_res.all() if r[0]]

    # Distinct turnos
    turno_res = await db.execute(
        select(distinct(subq.c.turno))
        .where(subq.c.turno.isnot(None))
        .order_by(subq.c.turno.asc())
    )
    turnos = [r[0] for r in turno_res.all() if r[0]]

    # Distinct reportado_por
    rp_res = await db.execute(
        select(distinct(subq.c.reportado_por_id), subq.c.reportado_por_nome)
        .where(subq.c.reportado_por_id.isnot(None))
        .order_by(subq.c.reportado_por_id.asc())
    )
    reportado_por = [
        {"id": r[0], "nome": r[1] or r[0]}
        for r in rp_res.all()
        if r[0]
    ]

    # Distinct tipos
    tipos_res = await db.execute(
        select(distinct(subq.c.tipo_ocorrencia))
        .where(subq.c.tipo_ocorrencia.isnot(None))
        .order_by(subq.c.tipo_ocorrencia.asc())
    )
    tipos = [r[0] for r in tipos_res.all() if r[0]]

    # Unique tags
    all_tags_res = await db.execute(select(subq.c.tags_customizadas))
    tags_set = set()
    for row in all_tags_res.all():
        if row[0] and isinstance(row[0], list):
            for t in row[0]:
                tags_set.add(str(t))

    return FacetsOut(
        planning_groups=planning_groups,
        arvores=arvores,
        turnos=turnos,
        reportado_por=reportado_por,
        tipos=tipos,
        tags=sorted(tags_set),
    )
