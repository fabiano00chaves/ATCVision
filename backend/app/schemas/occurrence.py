from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConfirmationOut(BaseModel):
    id: str
    data_execucao: Optional[date] = None
    hora_execucao: Optional[time] = None
    centro_trabalho: Optional[str] = None
    matricula: Optional[str] = None
    nome_executante: Optional[str] = None
    duracao_min: int = 0

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: str
    author_name: str
    comment_text: str
    is_action_item: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    comment_text: str
    is_action_item: bool = False


class CommentUpdate(BaseModel):
    comment_text: Optional[str] = None
    is_action_item: Optional[bool] = None


class BBox(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class MappingOut(BaseModel):
    id: str
    pdf_document_id: str
    document_filename: str
    report_period_start: Optional[datetime] = None
    report_period_end: Optional[datetime] = None
    start_page: int
    end_page: int
    page_sizes: List[Dict[str, float]] = []
    field_bboxes: Dict[str, List[Dict[str, float]]] = {}

    model_config = {"from_attributes": True}


class Operacao(BaseModel):
    numero: str
    descricao: str


class ObjetoItem(BaseModel):
    ordem: Optional[str] = None
    posicao_funcional: Optional[str] = None
    descricao: Optional[str] = None
    equipamento: Optional[str] = None
    description: Optional[str] = None


class OccurrenceSummaryOut(BaseModel):
    id: str
    unique_sap_key: str
    tipo_ocorrencia: str
    numero_nota: Optional[str] = None
    numero_ordem: Optional[str] = None
    titulo: str
    status_ordem: Optional[str] = None
    prioridade_sap: Optional[str] = None

    data_abertura: Optional[date] = None
    hora_abertura: Optional[time] = None
    abertura_timestamp: Optional[datetime] = None

    turno: Optional[str] = None
    grupo_planejamento: Optional[str] = None
    reportado_por_id: Optional[str] = None
    reportado_por_nome: Optional[str] = None

    especialidade: str
    posicao_funcional: Optional[str] = None
    arvore_planta: Optional[str] = None
    descricao_posicao_funcional: Optional[str] = None
    descricao_curta_objeto: Optional[str] = None

    teve_pane: bool
    duracao_pane_min: float
    duracao_avaria_min: Optional[float] = None

    tem_jump_force: bool
    jump_status: Optional[str] = None

    hh_total_minutos: int
    quantidade_executantes: int

    flag_analisar: bool
    flag_relevante: bool
    status_atc: str
    prioridade_atc: Optional[str] = None
    tags_customizadas: List[str] = []
    comment_count: int = 0
    snippet: Optional[str] = None

    document_ids: List[str] = []
    primary_document_id: Optional[str] = None

    # Optional extra on jump dashboard
    detalhe_jump_tarefas: Optional[str] = None

    model_config = {"from_attributes": True}


class OccurrenceDetailOut(OccurrenceSummaryOut):
    descricao_longa_notificacao: Optional[str] = None
    descricao_longa_ordem: Optional[str] = None
    texto_confirmacao: Optional[str] = None

    defeito: Optional[str] = None
    causa: Optional[str] = None
    observacoes_objeto: Optional[str] = None

    equipamento_codigo: Optional[str] = None
    equipamento_descricao: Optional[str] = None

    inicio_avaria: Optional[datetime] = None
    fim_avaria: Optional[datetime] = None

    detalhe_jump_tarefas: Optional[str] = None
    jump_retirado_em: Optional[datetime] = None

    operacoes: List[Operacao] = []
    objetos: List[ObjetoItem] = []
    confirmations: List[ConfirmationOut] = []
    comments: List[CommentOut] = []
    mappings: List[MappingOut] = []

    created_at: datetime
    updated_at: datetime


class OccurrencePatch(BaseModel):
    flag_analisar: Optional[bool] = None
    flag_relevante: Optional[bool] = None
    status_atc: Optional[str] = None
    prioridade_atc: Optional[str] = None
    tags_customizadas: Optional[List[str]] = None
    jump_status: Optional[str] = None  # PENDENTE | RETIRADO | None


class OccurrenceCountsOut(BaseModel):
    total: int
    presets: List[Dict[str, Any]] = []


class NeighborsOut(BaseModel):
    prev_id: Optional[str] = None
    next_id: Optional[str] = None
