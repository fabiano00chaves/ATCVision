from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class PdfDocument(Base):
    __tablename__ = "pdf_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash_sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    ocr_storage_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    report_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    report_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    emitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ocr_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ingestion_source: Mapped[str] = mapped_column(String(32), default="MANUAL_UPLOAD", nullable=False)
    parse_warnings: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    page_sizes: Mapped[List[Dict[str, float]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    mappings: Mapped[List[OccurrencePdfMapping]] = relationship(
        "OccurrencePdfMapping", back_populates="document", cascade="all, delete-orphan"
    )


class Occurrence(Base):
    __tablename__ = "occurrences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    unique_sap_key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    tipo_ocorrencia: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    numero_nota: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    numero_ordem: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    titulo: Mapped[str] = mapped_column(String(512), index=True, nullable=False)
    status_ordem: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    prioridade_sap: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tipo_ordem_sap: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    data_abertura: Mapped[Optional[datetime]] = mapped_column(Date, index=True, nullable=True)
    hora_abertura: Mapped[Optional[datetime]] = mapped_column(Time, nullable=True)
    abertura_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True, nullable=True)

    turno: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    grupo_planejamento: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    reportado_por_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    reportado_por_nome: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    especialidade: Mapped[str] = mapped_column(String(32), index=True, default="OUTRA", nullable=False)
    posicao_funcional: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)
    arvore_planta: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    descricao_posicao_funcional: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    descricao_curta_objeto: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    equipamento_codigo: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    equipamento_descricao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    descricao_longa_notificacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    descricao_longa_ordem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    texto_confirmacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    defeito: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    causa: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    observacoes_objeto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    inicio_avaria: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fim_avaria: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duracao_avaria_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    teve_pane: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    duracao_pane_min: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    tem_jump_force: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    jump_origem: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    detalhe_jump_tarefas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    jump_status: Mapped[Optional[str]] = mapped_column(String(32), default=None, nullable=True)
    jump_retirado_em: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    hh_total_minutos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quantidade_executantes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    operacoes: Mapped[List[Dict[str, str]]] = mapped_column(JSON, default=list, nullable=False)
    objetos: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    # ATC Management Flags (preserved during upserts)
    flag_analisar: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    flag_relevante: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    status_atc: Mapped[str] = mapped_column(String(32), default="NOVO", index=True, nullable=False)
    prioridade_atc: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    tags_customizadas: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    # Search text for typo/unaccent/like matching
    search_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    mappings: Mapped[List[OccurrencePdfMapping]] = relationship(
        "OccurrencePdfMapping", back_populates="occurrence", cascade="all, delete-orphan"
    )
    confirmations: Mapped[List[OccurrenceConfirmation]] = relationship(
        "OccurrenceConfirmation", back_populates="occurrence", cascade="all, delete-orphan"
    )
    comments: Mapped[List[OccurrenceComment]] = relationship(
        "OccurrenceComment", back_populates="occurrence", cascade="all, delete-orphan",
        order_by="OccurrenceComment.created_at.desc()"
    )


class OccurrencePdfMapping(Base):
    __tablename__ = "occurrence_pdf_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    occurrence_id: Mapped[str] = mapped_column(String(36), ForeignKey("occurrences.id", ondelete="CASCADE"), index=True, nullable=False)
    pdf_document_id: Mapped[str] = mapped_column(String(36), ForeignKey("pdf_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    start_page: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    end_page: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    field_bboxes: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    occurrence: Mapped[Occurrence] = relationship("Occurrence", back_populates="mappings")
    document: Mapped[PdfDocument] = relationship("PdfDocument", back_populates="mappings")


class OccurrenceConfirmation(Base):
    __tablename__ = "occurrence_confirmations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    occurrence_id: Mapped[str] = mapped_column(String(36), ForeignKey("occurrences.id", ondelete="CASCADE"), index=True, nullable=False)
    data_execucao: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    hora_execucao: Mapped[Optional[datetime]] = mapped_column(Time, nullable=True)
    centro_trabalho: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    matricula: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    nome_executante: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    duracao_min: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    occurrence: Mapped[Occurrence] = relationship("Occurrence", back_populates="confirmations")


class OccurrenceComment(Base):
    __tablename__ = "occurrence_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    occurrence_id: Mapped[str] = mapped_column(String(36), ForeignKey("occurrences.id", ondelete="CASCADE"), index=True, nullable=False)
    author_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    author_name: Mapped[str] = mapped_column(String(128), nullable=False)
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_action_item: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    occurrence: Mapped[Occurrence] = relationship("Occurrence", back_populates="comments")


class FilterPreset(Base):
    __tablename__ = "filter_presets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(64), default="Filter", nullable=False)
    color: Mapped[str] = mapped_column(String(32), default="#3b82f6", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_in_quickbar: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    filter_payload: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    selected_fields: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    grouping_field: Mapped[str] = mapped_column(String(64), default="arvore_planta", nullable=False)
    include_atc_comments: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    header_title: Mapped[str] = mapped_column(String(255), default="ATC Vision — Relatório de Confiabilidade", nullable=False)
    export_format_default: Mapped[str] = mapped_column(String(32), default="pdf", nullable=False)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    target_url: Mapped[str] = mapped_column(String(512), nullable=False)
    events: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    secret: Mapped[str] = mapped_column(String(128), default=generate_uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
