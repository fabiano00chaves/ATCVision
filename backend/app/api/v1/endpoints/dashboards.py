from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.api.v1.endpoints.occurrences import build_summary_out
from app.db.models import Occurrence, User
from app.db.session import get_db
from app.schemas.dashboard import (
    BadActorItem,
    BadActorsOut,
    DayBreakdown,
    FailureModesOut,
    JumpsOut,
    KpisOut,
    MatrixCell,
    QualityCard,
)
from app.services.occurrence_service import apply_occurrence_filters

router = APIRouter()


@router.get("/kpis", response_model=KpisOut)
async def get_kpis(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    base_query = select(Occurrence)
    filtered = await apply_occurrence_filters(base_query, filters, db)

    res = await db.execute(filtered)
    occurrences = res.scalars().all()

    total = len(occurrences)
    by_tipo: Dict[str, int] = defaultdict(int)
    by_especialidade: Dict[str, int] = defaultdict(int)
    by_arvore_counts: Dict[str, int] = defaultdict(int)
    by_arvore_pane: Dict[str, float] = defaultdict(float)
    by_turno: Dict[str, int] = defaultdict(int)

    pane_count = 0
    pane_total_min = 0.0
    jump_count = 0
    jump_pendentes = 0
    hh_total_min = 0

    pane_durations: List[float] = []
    pane_durations_arvore: Dict[str, List[float]] = defaultdict(list)
    pane_durations_esp: Dict[str, List[float]] = defaultdict(list)

    by_day_dict: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"CORRETIVA": 0, "NOTIFICACAO_GERAL": 0, "PREVENTIVA_CONDICAO": 0, "PREVENTIVA_TEMPO": 0, "pane_min": 0.0}
    )

    for o in occurrences:
        by_tipo[o.tipo_ocorrencia] += 1
        by_especialidade[o.especialidade] += 1
        arv = o.arvore_planta or "OUTRA"
        by_arvore_counts[arv] += 1
        if o.teve_pane:
            by_arvore_pane[arv] += o.duracao_pane_min
        if o.turno:
            by_turno[o.turno] += 1

        if o.teve_pane:
            pane_count += 1
            pane_total_min += o.duracao_pane_min
            dur = o.duracao_pane_min if o.duracao_pane_min > 0 else (o.duracao_avaria_min or 0.0)
            if dur > 0:
                pane_durations.append(dur)
                pane_durations_arvore[arv].append(dur)
                pane_durations_esp[o.especialidade].append(dur)

        if o.tem_jump_force:
            jump_count += 1
            if o.jump_status != "RETIRADO":
                jump_pendentes += 1

        hh_total_min += o.hh_total_minutos

        if o.data_abertura:
            d_str = o.data_abertura.isoformat()
            by_day_dict[d_str][o.tipo_ocorrencia] = by_day_dict[d_str].get(o.tipo_ocorrencia, 0) + 1
            if o.teve_pane:
                by_day_dict[d_str]["pane_min"] += o.duracao_pane_min

    mttr_min = round(sum(pane_durations) / len(pane_durations), 1) if pane_durations else None

    mttr_by_arvore = [
        {"arvore": arv, "mttr_min": round(sum(durs) / len(durs), 1), "count": len(durs)}
        for arv, durs in pane_durations_arvore.items()
    ]
    mttr_by_esp = [
        {"especialidade": esp, "mttr_min": round(sum(durs) / len(durs), 1), "count": len(durs)}
        for esp, durs in pane_durations_esp.items()
    ]

    by_day = [
        DayBreakdown(
            date=d,
            CORRETIVA=data.get("CORRETIVA", 0),
            NOTIFICACAO_GERAL=data.get("NOTIFICACAO_GERAL", 0),
            PREVENTIVA_CONDICAO=data.get("PREVENTIVA_CONDICAO", 0),
            PREVENTIVA_TEMPO=data.get("PREVENTIVA_TEMPO", 0),
            pane_min=round(data.get("pane_min", 0.0), 1),
        )
        for d, data in sorted(by_day_dict.items())
    ]

    return KpisOut(
        total=total,
        by_tipo=[{"tipo": k, "count": v} for k, v in by_tipo.items()],
        by_especialidade=[{"especialidade": k, "count": v} for k, v in by_especialidade.items()],
        by_arvore=[{"arvore": k, "count": v, "pane_min": round(by_arvore_pane[k], 1)} for k, v in by_arvore_counts.items()],
        by_turno=[{"turno": k, "count": v} for k, v in by_turno.items()],
        pane_count=pane_count,
        pane_total_min=round(pane_total_min, 1),
        jump_count=jump_count,
        jump_pendentes=jump_pendentes,
        hh_total_min=hh_total_min,
        mttr_min=mttr_min,
        mttr_by_arvore=mttr_by_arvore,
        mttr_by_especialidade=mttr_by_esp,
        by_day=by_day,
    )


@router.get("/bad-actors", response_model=BadActorsOut)
async def get_bad_actors(
    request: Request,
    days: int = Query(7, ge=1, le=90),
    min_count: int = Query(2, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now_dt = datetime.now()
    since_dt = now_dt - timedelta(days=days)

    filters = dict(request.query_params)
    # The bad actors endpoint specifically defines its time window via `days`
    filters.pop("start", None)
    filters.pop("end", None)
    filters.pop("days", None)
    filters.pop("min_count", None)

    query = (
        select(Occurrence)
        .where(
            Occurrence.posicao_funcional.isnot(None),
            Occurrence.abertura_timestamp >= since_dt,
        )
    )
    query = await apply_occurrence_filters(query, filters, db)
    query = query.order_by(Occurrence.abertura_timestamp.desc())

    res = await db.execute(query)
    occurrences = res.scalars().all()

    groups: Dict[str, List[Occurrence]] = defaultdict(list)
    for o in occurrences:
        if o.posicao_funcional:
            groups[o.posicao_funcional].append(o)

    bad_actors = []
    for pf, items in groups.items():
        if len(items) >= min_count:
            pane_sum = sum(o.duracao_pane_min for o in items if o.teve_pane)
            desc_str = items[0].descricao_posicao_funcional or items[0].descricao_curta_objeto
            bad_actors.append(
                BadActorItem(
                    posicao_funcional=pf,
                    descricao=desc_str,
                    arvore=items[0].arvore_planta,
                    count=len(items),
                    pane_min=round(pane_sum, 1),
                    last_at=items[0].abertura_timestamp,
                    occurrences=[
                        {
                            "id": o.id,
                            "titulo": o.titulo,
                            "abertura_timestamp": o.abertura_timestamp,
                            "teve_pane": o.teve_pane,
                            "duracao_pane_min": o.duracao_pane_min,
                        }
                        for o in items[:5]
                    ],
                )
            )

    bad_actors.sort(key=lambda x: (x.count, x.pane_min), reverse=True)
    return BadActorsOut(days=days, items=bad_actors)


@router.get("/failure-modes", response_model=FailureModesOut)
async def get_failure_modes(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    base_query = select(Occurrence)
    filtered = await apply_occurrence_filters(base_query, filters, db)

    res = await db.execute(filtered)
    occurrences = res.scalars().all()

    matrix_counts: Dict[tuple[str, str], int] = defaultdict(int)
    top_defeitos: Dict[str, int] = defaultdict(int)
    top_causas: Dict[str, int] = defaultdict(int)

    causa_nao_encontrada = 0
    analise_nao_realizada = 0
    sem_causa = 0
    sem_defeito = 0

    for o in occurrences:
        d = (o.defeito or "").strip()
        c = (o.causa or "").strip()

        if not d:
            sem_defeito += 1
        else:
            top_defeitos[d] += 1

        if not c:
            sem_causa += 1
        else:
            top_causas[c] += 1
            c_lower = c.lower()
            if "não encontrada" in c_lower or "nao encontrada" in c_lower:
                causa_nao_encontrada += 1
            if "não realizado" in c_lower or "nao realizado" in c_lower or "não realizada" in c_lower:
                analise_nao_realizada += 1

        if d and c:
            matrix_counts[(d, c)] += 1

    matrix = [
        MatrixCell(defeito=k[0], causa=k[1], count=v)
        for k, v in sorted(matrix_counts.items(), key=lambda kv: kv[1], reverse=True)[:30]
    ]

    total = len(occurrences)
    poor_quality_count = sem_causa + sem_defeito + causa_nao_encontrada + analise_nao_realizada
    pct = round((poor_quality_count / total * 100), 1) if total > 0 else 0.0

    quality = QualityCard(
        total=total,
        causa_nao_encontrada=causa_nao_encontrada,
        analise_nao_realizada=analise_nao_realizada,
        sem_causa=sem_causa,
        sem_defeito=sem_defeito,
        pct_baixa_qualidade=pct,
    )

    top_d_list = [{"label": k, "count": v} for k, v in sorted(top_defeitos.items(), key=lambda kv: kv[1], reverse=True)[:10]]
    top_c_list = [{"label": k, "count": v} for k, v in sorted(top_causas.items(), key=lambda kv: kv[1], reverse=True)[:10]]

    return FailureModesOut(
        matrix=matrix,
        top_defeitos=top_d_list,
        top_causas=top_c_list,
        quality=quality,
    )


@router.get("/jumps", response_model=JumpsOut)
async def get_jumps(
    request: Request,
    jump_status: Optional[str] = Query("ALL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = dict(request.query_params)
    filters["only_jump"] = True

    base_query = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.mappings),
            selectinload(Occurrence.comments),
        )
    )
    filtered = await apply_occurrence_filters(base_query, filters, db)

    if jump_status and jump_status.upper() != "ALL":
        filtered = filtered.where(Occurrence.jump_status == jump_status.upper())

    filtered = filtered.order_by(Occurrence.abertura_timestamp.desc())

    res = await db.execute(filtered)
    occurrences = res.scalars().all()

    items = [build_summary_out(o) for o in occurrences]
    return JumpsOut(items=items, total=len(items))
