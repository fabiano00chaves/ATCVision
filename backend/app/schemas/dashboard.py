from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from app.schemas.occurrence import OccurrenceSummaryOut


class CountByGroup(BaseModel):
    label: str
    count: int
    pane_min: Optional[float] = 0.0


class MttrByGroup(BaseModel):
    label: str
    mttr_min: Optional[float] = None
    count: int


class DayBreakdown(BaseModel):
    date: str
    CORRETIVA: int = 0
    NOTIFICACAO_GERAL: int = 0
    PREVENTIVA_CONDICAO: int = 0
    PREVENTIVA_TEMPO: int = 0
    pane_min: float = 0.0


class KpisOut(BaseModel):
    total: int
    by_tipo: List[Dict[str, Any]]
    by_especialidade: List[Dict[str, Any]]
    by_arvore: List[Dict[str, Any]]
    by_turno: List[Dict[str, Any]]
    pane_count: int
    pane_total_min: float
    jump_count: int
    jump_pendentes: int
    hh_total_min: int
    mttr_min: Optional[float] = None
    mttr_by_arvore: List[Dict[str, Any]] = []
    mttr_by_especialidade: List[Dict[str, Any]] = []
    by_day: List[DayBreakdown] = []


class BadActorItem(BaseModel):
    posicao_funcional: str
    descricao: Optional[str] = None
    arvore: Optional[str] = None
    count: int
    pane_min: float
    last_at: Optional[datetime] = None
    occurrences: List[Dict[str, Any]] = []


class BadActorsOut(BaseModel):
    days: int
    items: List[BadActorItem]


class MatrixCell(BaseModel):
    defeito: str
    causa: str
    count: int


class QualityCard(BaseModel):
    total: int
    causa_nao_encontrada: int
    analise_nao_realizada: int
    sem_causa: int
    sem_defeito: int
    pct_baixa_qualidade: float


class FailureModesOut(BaseModel):
    matrix: List[MatrixCell]
    top_defeitos: List[Dict[str, Any]]
    top_causas: List[Dict[str, Any]]
    quality: QualityCard


class JumpsOut(BaseModel):
    items: List[OccurrenceSummaryOut]
    total: int
