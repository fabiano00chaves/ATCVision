from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import fitz
from sqlalchemy import (
    and_,
    case,
    delete,
    desc,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import (
    FilterPreset,
    Occurrence,
    OccurrenceComment,
    OccurrenceConfirmation,
    OccurrencePdfMapping,
    PdfDocument,
    SystemSetting,
    User,
)
from app.schemas.occurrence import OccurrencePatch
from app.services.pdf_extractor import (
    ExtractionResult,
    ParsedOccurrence,
    ensure_text_layer,
    extract_from_document,
)

log = logging.getLogger("atc.occurrence_service")


def calculate_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def build_search_text(occ: ParsedOccurrence) -> str:
    parts = [
        occ.titulo or "",
        occ.posicao_funcional or "",
        occ.descricao_posicao_funcional or "",
        occ.descricao_curta_objeto or "",
        occ.descricao_longa_notificacao or "",
        occ.descricao_longa_ordem or "",
        occ.texto_confirmacao or "",
        occ.defeito or "",
        occ.causa or "",
        occ.observacoes_objeto or "",
        occ.equipamento_codigo or "",
        occ.equipamento_descricao or "",
        occ.reportado_por_id or "",
        occ.reportado_por_nome or "",
        occ.grupo_planejamento or "",
    ]
    for c in occ.confirmations:
        if c.nome_executante:
            parts.append(c.nome_executante)
        if c.matricula:
            parts.append(c.matricula)
        if c.centro_trabalho:
            parts.append(c.centro_trabalho)
    return " ".join(p.strip() for p in parts if p)


async def get_system_settings(db: AsyncSession) -> Dict[str, Any]:
    res = await db.execute(select(SystemSetting).where(SystemSetting.key == "general"))
    row = res.scalar_one_or_none()
    if row and row.value:
        return row.value
    return {
        "daily_cutoff_start": settings.DAILY_CUTOFF_START,
        "daily_cutoff_end": settings.DAILY_CUTOFF_END,
        "default_home": settings.DEFAULT_HOME,
        "timezone": settings.TIMEZONE,
        "watch_folder_enabled": True,
        "watch_folder_path": str(settings.WATCH_FOLDER_DIR),
        "ocr_enabled": settings.OCR_ENABLED,
        "ocr_min_chars_per_page": settings.OCR_MIN_CHARS_PER_PAGE,
        "bad_actor_default_days": settings.BAD_ACTOR_DEFAULT_DAYS,
        "specialty_rules": {
            "ELETRICA": ["STGEET", "ELET", "AUTOM", "058/AT00"],
            "MECANICA": ["STGEMT", "MEC", "184/AT00", "068/AT00"],
        },
    }


async def ingest_pdf_file(
    db: AsyncSession,
    file_path: Path,
    original_filename: str,
    source: str = "MANUAL_UPLOAD",
) -> Tuple[Optional[PdfDocument], int, int, str]:
    """Ingests a PDF file into the database.
    Returns (PdfDocument or None, created_count, updated_count, status_message).
    """
    file_hash = calculate_sha256(file_path)

    # Check for duplicate
    dup_res = await db.execute(select(PdfDocument).where(PdfDocument.file_hash_sha256 == file_hash))
    existing_doc = dup_res.scalar_one_or_none()
    if existing_doc:
        return existing_doc, 0, 0, "duplicate"

    sys_settings = await get_system_settings(db)
    ocr_enabled = sys_settings.get("ocr_enabled", True)
    ocr_min_chars = sys_settings.get("ocr_min_chars_per_page", 40)
    specialty_rules = sys_settings.get("specialty_rules")

    # Destination storage paths
    doc_id = str(Path(file_path).stem)
    stored_pdf_name = f"{file_hash[:16]}_{original_filename}"
    target_storage = settings.STORAGE_DIR / stored_pdf_name
    ocr_storage = settings.STORAGE_DIR / f"ocr_{stored_pdf_name}"

    if file_path != target_storage:
        shutil.copy2(file_path, target_storage)

    # OCR step if needed
    viewable_path, ocr_applied, ocr_warnings = ensure_text_layer(
        target_storage, ocr_storage, enabled=ocr_enabled, min_chars_per_page=ocr_min_chars
    )

    # Extract data from viewable PDF (preserves coordinate alignment)
    with fitz.open(viewable_path) as doc:
        extraction = extract_from_document(doc, specialty_rules=specialty_rules)

    all_warnings = ocr_warnings + extraction.warnings

    pdf_doc = PdfDocument(
        filename=original_filename,
        file_hash_sha256=file_hash,
        storage_path=str(target_storage),
        ocr_storage_path=str(ocr_storage) if ocr_applied else None,
        report_period_start=extraction.report_period_start,
        report_period_end=extraction.report_period_end,
        emitted_at=extraction.emitted_at,
        page_count=extraction.page_count,
        ocr_applied=ocr_applied,
        ingestion_source=source,
        parse_warnings=all_warnings,
        page_sizes=extraction.page_sizes,
    )
    db.add(pdf_doc)
    await db.flush()

    created_count = 0
    updated_count = 0

    for parsed_occ in extraction.occurrences:
        key = parsed_occ.unique_sap_key
        if not key:
            continue

        occ_res = await db.execute(
            select(Occurrence)
            .options(selectinload(Occurrence.confirmations), selectinload(Occurrence.mappings))
            .where(Occurrence.unique_sap_key == key)
        )
        existing_occ = occ_res.scalar_one_or_none()

        search_txt = build_search_text(parsed_occ)

        if existing_occ:
            # Update SAP fields only - PRESERVE ATC FLAGS, STATUS, PRIORIDADE, TAGS, COMMENTS
            existing_occ.tipo_ocorrencia = parsed_occ.tipo_ocorrencia
            existing_occ.numero_nota = parsed_occ.numero_nota or existing_occ.numero_nota
            existing_occ.numero_ordem = parsed_occ.numero_ordem or existing_occ.numero_ordem
            existing_occ.titulo = parsed_occ.titulo or existing_occ.titulo
            existing_occ.status_ordem = parsed_occ.status_ordem or existing_occ.status_ordem
            existing_occ.prioridade_sap = parsed_occ.prioridade_sap or existing_occ.prioridade_sap
            existing_occ.tipo_ordem_sap = parsed_occ.tipo_ordem_sap or existing_occ.tipo_ordem_sap
            existing_occ.data_abertura = parsed_occ.data_abertura or existing_occ.data_abertura
            existing_occ.hora_abertura = parsed_occ.hora_abertura or existing_occ.hora_abertura
            existing_occ.abertura_timestamp = parsed_occ.abertura_timestamp or existing_occ.abertura_timestamp
            existing_occ.turno = parsed_occ.turno or existing_occ.turno
            existing_occ.grupo_planejamento = parsed_occ.grupo_planejamento or existing_occ.grupo_planejamento
            existing_occ.reportado_por_id = parsed_occ.reportado_por_id or existing_occ.reportado_por_id
            existing_occ.reportado_por_nome = parsed_occ.reportado_por_nome or existing_occ.reportado_por_nome
            existing_occ.especialidade = parsed_occ.especialidade
            existing_occ.posicao_funcional = parsed_occ.posicao_funcional or existing_occ.posicao_funcional
            existing_occ.arvore_planta = parsed_occ.arvore_planta or existing_occ.arvore_planta
            existing_occ.descricao_posicao_funcional = (
                parsed_occ.descricao_posicao_funcional or existing_occ.descricao_posicao_funcional
            )
            existing_occ.descricao_curta_objeto = (
                parsed_occ.descricao_curta_objeto or existing_occ.descricao_curta_objeto
            )
            existing_occ.equipamento_codigo = parsed_occ.equipamento_codigo or existing_occ.equipamento_codigo
            existing_occ.equipamento_descricao = (
                parsed_occ.equipamento_descricao or existing_occ.equipamento_descricao
            )
            existing_occ.descricao_longa_notificacao = (
                parsed_occ.descricao_longa_notificacao or existing_occ.descricao_longa_notificacao
            )
            existing_occ.descricao_longa_ordem = (
                parsed_occ.descricao_longa_ordem or existing_occ.descricao_longa_ordem
            )
            existing_occ.texto_confirmacao = parsed_occ.texto_confirmacao or existing_occ.texto_confirmacao
            existing_occ.defeito = parsed_occ.defeito or existing_occ.defeito
            existing_occ.causa = parsed_occ.causa or existing_occ.causa
            existing_occ.observacoes_objeto = parsed_occ.observacoes_objeto or existing_occ.observacoes_objeto
            existing_occ.inicio_avaria = parsed_occ.inicio_avaria or existing_occ.inicio_avaria
            existing_occ.fim_avaria = parsed_occ.fim_avaria or existing_occ.fim_avaria
            existing_occ.duracao_avaria_min = parsed_occ.duracao_avaria_min or existing_occ.duracao_avaria_min
            existing_occ.teve_pane = parsed_occ.teve_pane or existing_occ.teve_pane
            existing_occ.duracao_pane_min = max(existing_occ.duracao_pane_min, parsed_occ.duracao_pane_min)
            existing_occ.tem_jump_force = parsed_occ.tem_jump_force or existing_occ.tem_jump_force
            existing_occ.detalhe_jump_tarefas = (
                parsed_occ.detalhe_jump_tarefas or existing_occ.detalhe_jump_tarefas
            )
            existing_occ.hh_total_minutos = max(existing_occ.hh_total_minutos, parsed_occ.hh_total_minutos)
            existing_occ.quantidade_executantes = max(
                existing_occ.quantidade_executantes, parsed_occ.quantidade_executantes
            )
            existing_occ.operacoes = parsed_occ.operacoes or existing_occ.operacoes
            existing_occ.objetos = parsed_occ.objetos or existing_occ.objetos
            existing_occ.search_text = (existing_occ.search_text or "") + " " + search_txt

            # Overwrite confirmations with the latest non-empty set
            if parsed_occ.confirmations:
                await db.execute(
                    delete(OccurrenceConfirmation).where(OccurrenceConfirmation.occurrence_id == existing_occ.id)
                )
                for conf in parsed_occ.confirmations:
                    db.add(
                        OccurrenceConfirmation(
                            occurrence_id=existing_occ.id,
                            data_execucao=conf.data_execucao,
                            hora_execucao=conf.hora_execucao,
                            centro_trabalho=conf.centro_trabalho,
                            matricula=conf.matricula,
                            nome_executante=conf.nome_executante,
                            duracao_min=conf.duracao_min,
                        )
                    )

            # Add mapping for this PDF if not present
            mapping = OccurrencePdfMapping(
                occurrence_id=existing_occ.id,
                pdf_document_id=pdf_doc.id,
                start_page=parsed_occ.start_page,
                end_page=parsed_occ.end_page,
                field_bboxes=parsed_occ.field_bboxes,
            )
            db.add(mapping)
            updated_count += 1
        else:
            # Create new occurrence
            new_occ = Occurrence(
                unique_sap_key=key,
                tipo_ocorrencia=parsed_occ.tipo_ocorrencia,
                numero_nota=parsed_occ.numero_nota,
                numero_ordem=parsed_occ.numero_ordem,
                titulo=parsed_occ.titulo,
                status_ordem=parsed_occ.status_ordem,
                prioridade_sap=parsed_occ.prioridade_sap,
                tipo_ordem_sap=parsed_occ.tipo_ordem_sap,
                data_abertura=parsed_occ.data_abertura,
                hora_abertura=parsed_occ.hora_abertura,
                abertura_timestamp=parsed_occ.abertura_timestamp,
                turno=parsed_occ.turno,
                grupo_planejamento=parsed_occ.grupo_planejamento,
                reportado_por_id=parsed_occ.reportado_por_id,
                reportado_por_nome=parsed_occ.reportado_por_nome,
                especialidade=parsed_occ.especialidade,
                posicao_funcional=parsed_occ.posicao_funcional,
                arvore_planta=parsed_occ.arvore_planta,
                descricao_posicao_funcional=parsed_occ.descricao_posicao_funcional,
                descricao_curta_objeto=parsed_occ.descricao_curta_objeto,
                equipamento_codigo=parsed_occ.equipamento_codigo,
                equipamento_descricao=parsed_occ.equipamento_descricao,
                descricao_longa_notificacao=parsed_occ.descricao_longa_notificacao,
                descricao_longa_ordem=parsed_occ.descricao_longa_ordem,
                texto_confirmacao=parsed_occ.texto_confirmacao,
                defeito=parsed_occ.defeito,
                causa=parsed_occ.causa,
                observacoes_objeto=parsed_occ.observacoes_objeto,
                inicio_avaria=parsed_occ.inicio_avaria,
                fim_avaria=parsed_occ.fim_avaria,
                duracao_avaria_min=parsed_occ.duracao_avaria_min,
                teve_pane=parsed_occ.teve_pane,
                duracao_pane_min=parsed_occ.duracao_pane_min,
                tem_jump_force=parsed_occ.tem_jump_force,
                jump_origem=parsed_occ.jump_origem,
                detalhe_jump_tarefas=parsed_occ.detalhe_jump_tarefas,
                jump_status="PENDENTE" if parsed_occ.tem_jump_force else None,
                hh_total_minutos=parsed_occ.hh_total_minutos,
                quantidade_executantes=parsed_occ.quantidade_executantes,
                operacoes=parsed_occ.operacoes,
                objetos=parsed_occ.objetos,
                flag_analisar=False,
                flag_relevante=False,
                status_atc="NOVO",
                prioridade_atc=None,
                tags_customizadas=[],
                search_text=search_txt,
            )
            db.add(new_occ)
            await db.flush()

            for conf in parsed_occ.confirmations:
                db.add(
                    OccurrenceConfirmation(
                        occurrence_id=new_occ.id,
                        data_execucao=conf.data_execucao,
                        hora_execucao=conf.hora_execucao,
                        centro_trabalho=conf.centro_trabalho,
                        matricula=conf.matricula,
                        nome_executante=conf.nome_executante,
                        duracao_min=conf.duracao_min,
                    )
                )

            mapping = OccurrencePdfMapping(
                occurrence_id=new_occ.id,
                pdf_document_id=pdf_doc.id,
                start_page=parsed_occ.start_page,
                end_page=parsed_occ.end_page,
                field_bboxes=parsed_occ.field_bboxes,
            )
            db.add(mapping)
            created_count += 1

    await db.commit()
    await db.refresh(pdf_doc)
    return pdf_doc, created_count, updated_count, "created"


def parse_csv_param(val: Any) -> List[str]:
    if not val:
        return []
    if isinstance(val, list):
        out: List[str] = []
        for v in val:
            out.extend(parse_csv_param(v))
        return out
    s = str(val).strip()
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
        try:
            import json
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return parse_csv_param(parsed)
        except Exception:
            pass
        s = s.strip("[]()").strip()
    tokens = re.split(r"[,;\n\r]+", s)
    return [p.strip().strip("'\"") for p in tokens if p.strip().strip("'\"")]


async def apply_occurrence_filters(
    query,
    filters: Dict[str, Any],
    db: AsyncSession,
):
    """Applies shared filters to an Occurrence select statement."""
    # Preset handling
    preset_id = filters.get("preset_id")
    if preset_id:
        p_res = await db.execute(select(FilterPreset).where(FilterPreset.id == str(preset_id)))
        preset = p_res.scalar_one_or_none()
        if preset and preset.filter_payload:
            payload = preset.filter_payload
            # Merge preset payload with caller filters (caller filters override if explicitly present)
            for k, v in payload.items():
                if k not in filters or filters[k] is None or filters[k] == "":
                    filters[k] = v

    start = filters.get("start")
    if start:
        try:
            dt_start = datetime.fromisoformat(str(start).replace("Z", ""))
            query = query.where(Occurrence.abertura_timestamp >= dt_start)
        except ValueError:
            pass

    end = filters.get("end")
    if end:
        try:
            dt_end = datetime.fromisoformat(str(end).replace("Z", ""))
            query = query.where(Occurrence.abertura_timestamp < dt_end)
        except ValueError:
            pass

    doc_ids = parse_csv_param(filters.get("document_ids"))
    if doc_ids:
        query = query.join(Occurrence.mappings).where(OccurrencePdfMapping.pdf_document_id.in_(doc_ids)).distinct()

    q = filters.get("q")
    keywords = parse_csv_param(filters.get("keywords"))
    all_keywords = []
    if q and str(q).strip():
        all_keywords.append(str(q).strip())
    all_keywords.extend(keywords)

    if all_keywords:
        for kw in all_keywords:
            pattern = f"%{kw}%"
            query = query.where(
                or_(
                    Occurrence.titulo.ilike(pattern),
                    Occurrence.search_text.ilike(pattern),
                    Occurrence.posicao_funcional.ilike(pattern),
                    Occurrence.descricao_posicao_funcional.ilike(pattern),
                    Occurrence.defeito.ilike(pattern),
                    Occurrence.causa.ilike(pattern),
                )
            )

    nota = filters.get("nota")
    if nota:
        query = query.where(Occurrence.numero_nota.ilike(f"%{nota}%"))

    ordem = filters.get("ordem")
    if ordem:
        query = query.where(Occurrence.numero_ordem.ilike(f"%{ordem}%"))

    fl_prefixes = parse_csv_param(filters.get("fl_prefixes") or filters.get("functional_locations_prefixes"))
    if fl_prefixes:
        conditions = []
        for p in fl_prefixes:
            p_clean = p.strip()
            if not p_clean:
                continue
            if "%" in p_clean or "_" in p_clean:
                pattern = p_clean
            elif p_clean.upper().startswith("BT-") or p_clean.upper().startswith("BT/"):
                pattern = f"{p_clean}%"
            else:
                pattern = f"%{p_clean}%"
            conditions.append(
                or_(
                    Occurrence.posicao_funcional.ilike(pattern),
                    Occurrence.arvore_planta.ilike(p_clean),
                )
            )
        if conditions:
            query = query.where(or_(*conditions))

    arvores = parse_csv_param(filters.get("arvores"))
    if arvores:
        query = query.where(Occurrence.arvore_planta.in_(arvores))

    fl_desc = filters.get("fl_desc")
    if fl_desc:
        query = query.where(Occurrence.descricao_posicao_funcional.ilike(f"%{fl_desc}%"))

    specialties = parse_csv_param(filters.get("specialties"))
    if specialties:
        query = query.where(Occurrence.especialidade.in_(specialties))

    turnos = parse_csv_param(filters.get("turnos"))
    if turnos:
        query = query.where(Occurrence.turno.in_(turnos))

    planning_groups = parse_csv_param(filters.get("planning_groups"))
    if planning_groups:
        query = query.where(Occurrence.grupo_planejamento.in_(planning_groups))

    reportado_por_ids = parse_csv_param(filters.get("reportado_por_ids"))
    if reportado_por_ids:
        query = query.where(Occurrence.reportado_por_id.in_(reportado_por_ids))

    tipos = parse_csv_param(filters.get("tipos"))
    if tipos:
        query = query.where(Occurrence.tipo_ocorrencia.in_(tipos))

    status_atc = parse_csv_param(filters.get("status_atc"))
    if status_atc:
        query = query.where(Occurrence.status_atc.in_(status_atc))

    prioridade_atc = parse_csv_param(filters.get("prioridade_atc"))
    if prioridade_atc:
        query = query.where(Occurrence.prioridade_atc.in_(prioridade_atc))

    def to_bool(val: Any) -> bool:
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() in ("true", "1", "t", "yes")
        return bool(val)

    if to_bool(filters.get("only_pane")):
        query = query.where(Occurrence.teve_pane.is_(True))

    if to_bool(filters.get("only_jump")):
        query = query.where(Occurrence.tem_jump_force.is_(True))

    if to_bool(filters.get("only_relevant")):
        query = query.where(Occurrence.flag_relevante.is_(True))

    if to_bool(filters.get("only_analyze")):
        query = query.where(Occurrence.flag_analisar.is_(True))

    return query


def apply_occurrence_sorting(query, sort_key: Optional[str] = "abertura_desc"):
    if sort_key == "abertura_asc":
        return query.order_by(Occurrence.abertura_timestamp.asc().nulls_last())
    elif sort_key == "pane_desc":
        return query.order_by(Occurrence.duracao_pane_min.desc(), Occurrence.abertura_timestamp.desc())
    elif sort_key == "relevance":
        return query.order_by(
            Occurrence.flag_relevante.desc(),
            Occurrence.flag_analisar.desc(),
            Occurrence.abertura_timestamp.desc(),
        )
    else:  # abertura_desc default
        return query.order_by(Occurrence.abertura_timestamp.desc().nulls_last())
