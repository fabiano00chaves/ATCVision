from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import pymupdf as fitz
except ImportError:
    import fitz
from sqlalchemy import (
    and_,
    case,
    delete,
    desc,
    exists,
    func,
    or_,
    select,
    update,
    String,
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


_TEXT_CONFIRM_DT_RE = re.compile(
    r"(?:^|\n)\s*(\d{2})[./](\d{2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?"
)


def compute_confirmation_bounds(
    confirmations: Iterable[Any],
    texto_confirmacao: Optional[str] = None,
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Computes the earliest and latest confirmation datetimes by combining
    structured SAP confirmation table rows and SAP confirmation text log headers
    (e.g. '10.11.2026 16:35:05 99021165'). If a date has both a 00:00:00 table row
    and an explicit time from confirmation text logs, preserves the explicit time.
    """
    candidates: List[datetime] = []

    for c in confirmations or []:
        d = getattr(c, "data_execucao", None)
        if d is None:
            continue
        t = getattr(c, "hora_execucao", None) or time(0, 0, 0)
        try:
            dt = datetime.combine(d, t)
            if 2000 <= dt.year <= 2100:
                candidates.append(dt)
        except Exception:
            pass

    if texto_confirmacao:
        for m in _TEXT_CONFIRM_DT_RE.finditer(texto_confirmacao):
            try:
                day_i, mon_i, year_i = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if not (2000 <= year_i <= 2100):
                    continue
                hour_i = int(m.group(4)) if m.group(4) is not None else 0
                min_i = int(m.group(5)) if m.group(5) is not None else 0
                sec_i = int(m.group(6)) if m.group(6) is not None else 0
                dt = datetime(year_i, mon_i, day_i, hour_i, min_i, sec_i)
                candidates.append(dt)
            except ValueError:
                continue

    if not candidates:
        return None, None

    non_midnight_dates = {dt.date() for dt in candidates if dt.time() != time(0, 0, 0)}
    refined = [
        dt
        for dt in candidates
        if dt.time() != time(0, 0, 0) or dt.date() not in non_midnight_dates
    ]
    pool = refined or candidates
    return min(pool), max(pool)


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
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    doc_id = str(Path(file_path).stem)
    stored_pdf_name = f"{file_hash[:16]}_{original_filename}"
    target_storage = settings.STORAGE_DIR / stored_pdf_name
    ocr_storage = settings.STORAGE_DIR / f"ocr_{stored_pdf_name}"

    def _cleanup_partial_files():
        if target_storage.exists() and file_path != target_storage:
            try:
                os.remove(target_storage)
            except OSError:
                pass
        if ocr_storage.exists():
            try:
                os.remove(ocr_storage)
            except OSError:
                pass

    try:
        if file_path != target_storage:
            shutil.copy2(file_path, target_storage)

        # OCR step if needed
        viewable_path, ocr_applied, ocr_warnings = ensure_text_layer(
            target_storage, ocr_storage, enabled=ocr_enabled, min_chars_per_page=ocr_min_chars
        )

        # Extract data from viewable PDF (preserves coordinate alignment)
        with fitz.open(viewable_path) as doc:
            extraction = extract_from_document(doc, specialty_rules=specialty_rules)
    except Exception as exc:
        _cleanup_partial_files()
        raise exc

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
    try:
        await db.flush()

        created_count = 0
        updated_count = 0
        fl_items_to_learn: List[Dict[str, Any]] = []

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
                if parsed_occ.duracao_avaria_min is not None:
                    existing_occ.duracao_avaria_min = parsed_occ.duracao_avaria_min
                if parsed_occ.teve_pane is not None:
                    existing_occ.teve_pane = parsed_occ.teve_pane
                if parsed_occ.duracao_pane_min is not None:
                    existing_occ.duracao_pane_min = max(existing_occ.duracao_pane_min or 0.0, parsed_occ.duracao_pane_min)
                if parsed_occ.tem_jump_force is not None:
                    existing_occ.tem_jump_force = parsed_occ.tem_jump_force
                existing_occ.detalhe_jump_tarefas = (
                    parsed_occ.detalhe_jump_tarefas or existing_occ.detalhe_jump_tarefas
                )
                if parsed_occ.hh_total_minutos is not None:
                    existing_occ.hh_total_minutos = max(existing_occ.hh_total_minutos or 0, parsed_occ.hh_total_minutos)
                if parsed_occ.quantidade_executantes is not None:
                    existing_occ.quantidade_executantes = max(
                        existing_occ.quantidade_executantes or 0, parsed_occ.quantidade_executantes
                    )
                existing_occ.operacoes = parsed_occ.operacoes or existing_occ.operacoes
                existing_occ.objetos = parsed_occ.objetos or existing_occ.objetos
                existing_occ.search_text = search_txt

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

                conf_min, conf_max = compute_confirmation_bounds(
                    parsed_occ.confirmations or existing_occ.confirmations,
                    parsed_occ.texto_confirmacao or existing_occ.texto_confirmacao,
                )
                if conf_min is not None:
                    if existing_occ.primeira_confirmacao_em is None or conf_min < existing_occ.primeira_confirmacao_em:
                        existing_occ.primeira_confirmacao_em = conf_min
                if conf_max is not None:
                    if existing_occ.ultima_confirmacao_em is None or conf_max > existing_occ.ultima_confirmacao_em:
                        existing_occ.ultima_confirmacao_em = conf_max

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
                conf_min, conf_max = compute_confirmation_bounds(
                    parsed_occ.confirmations,
                    parsed_occ.texto_confirmacao,
                )
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
                    primeira_confirmacao_em=conf_min,
                    ultima_confirmacao_em=conf_max,
                    operacoes=parsed_occ.operacoes,
                    objetos=parsed_occ.objetos,
                    flag_analisar=False,
                    flag_relevante=False,
                    flag_destaque_reuniao=False,
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
                if parsed_occ.posicao_funcional:
                    fl_items_to_learn.append({
                        "code": parsed_occ.posicao_funcional,
                        "description": parsed_occ.descricao_posicao_funcional or parsed_occ.descricao_curta_objeto,
                        "arvore_planta": parsed_occ.arvore_planta,
                    })

        if fl_items_to_learn:
            try:
                from app.services.functional_location_service import learn_functional_locations_batch
                await learn_functional_locations_batch(db, fl_items_to_learn)
            except Exception as e:
                log.warning("Failed to learn functional locations during ingestion: %s", e)

        await db.commit()
        await db.refresh(pdf_doc)
        return pdf_doc, created_count, updated_count, "created"
    except Exception as exc:
        await db.rollback()
        _cleanup_partial_files()
        raise exc


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


def parse_filter_datetime(val: Any, is_end: bool = False) -> Optional[datetime]:
    if not val:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        clean = s.replace("Z", "+00:00").replace("z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        if is_end and len(s) == 10:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        return dt
    except Exception:
        try:
            d = datetime.strptime(s[:10], "%Y-%m-%d")
            if is_end:
                d = d.replace(hour=23, minute=59, second=59, microsecond=999999)
            return d
        except Exception:
            return None


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

    dt_start = parse_filter_datetime(filters.get("start"), is_end=False)
    dt_end = parse_filter_datetime(filters.get("end"), is_end=True)

    if dt_start is not None or dt_end is not None:
        date_mode = str(filters.get("date_mode") or "abertura").lower()

        opening_conds = []
        if dt_start is not None:
            opening_conds.append(Occurrence.abertura_timestamp >= dt_start)
        if dt_end is not None:
            opening_conds.append(Occurrence.abertura_timestamp <= dt_end)
        opening_clause = and_(*opening_conds) if opening_conds else None

        if date_mode in ("confirmacao", "atividade"):
            start_date = dt_start.date() if dt_start is not None else None
            end_date = dt_end.date() if dt_end is not None else None

            exact_conf_conds = [Occurrence.ultima_confirmacao_em.isnot(None)]
            if dt_start is not None:
                exact_conf_conds.append(Occurrence.ultima_confirmacao_em >= dt_start)
            if dt_end is not None:
                exact_conf_conds.append(Occurrence.ultima_confirmacao_em <= dt_end)

            midnight_conds = [
                Occurrence.ultima_confirmacao_em.isnot(None),
                func.extract("hour", Occurrence.ultima_confirmacao_em) == 0,
                func.extract("minute", Occurrence.ultima_confirmacao_em) == 0,
                func.extract("second", Occurrence.ultima_confirmacao_em) == 0,
            ]
            if start_date is not None:
                midnight_conds.append(Occurrence.ultima_confirmacao_em >= datetime.combine(start_date, time(0, 0, 0)))
            if end_date is not None:
                midnight_conds.append(Occurrence.ultima_confirmacao_em <= datetime.combine(end_date, time(0, 0, 0)))

            conf_row_conds = [
                OccurrenceConfirmation.occurrence_id == Occurrence.id,
                OccurrenceConfirmation.data_execucao.isnot(None),
                or_(
                    OccurrenceConfirmation.hora_execucao.is_(None),
                    OccurrenceConfirmation.hora_execucao == time(0, 0, 0),
                ),
            ]
            if start_date is not None:
                conf_row_conds.append(OccurrenceConfirmation.data_execucao >= start_date)
            if end_date is not None:
                conf_row_conds.append(OccurrenceConfirmation.data_execucao <= end_date)

            conf_clause = or_(
                and_(*exact_conf_conds),
                and_(*midnight_conds),
                exists(select(OccurrenceConfirmation.id).where(*conf_row_conds)),
            )

            if date_mode == "confirmacao":
                query = query.where(conf_clause)
            else:  # "atividade": opened OR confirmed within the period
                query = query.where(or_(opening_clause, conf_clause))
        else:
            if opening_clause is not None:
                query = query.where(opening_clause)

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

    prioridade_sap = parse_csv_param(filters.get("prioridade_sap"))
    if prioridade_sap:
        query = query.where(Occurrence.prioridade_sap.in_(prioridade_sap))

    jump_status = filters.get("jump_status")
    if jump_status and str(jump_status).upper() != "ALL":
        query = query.where(Occurrence.jump_status == str(jump_status).upper())

    tags = parse_csv_param(filters.get("tags"))
    if tags:
        for t in tags:
            query = query.where(func.cast(Occurrence.tags_customizadas, String).ilike(f"%{t}%"))

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

    if to_bool(filters.get("only_meeting")):
        query = query.where(Occurrence.flag_destaque_reuniao.is_(True))

    return query


def apply_occurrence_sorting(query, sort_key: Optional[str] = "abertura_desc"):
    if sort_key == "abertura_asc":
        return query.order_by(
            Occurrence.abertura_timestamp.asc().nulls_last(),
            Occurrence.numero_ordem.asc().nulls_last(),
        )
    elif sort_key == "confirmacao_desc":
        return query.order_by(
            Occurrence.ultima_confirmacao_em.desc().nulls_last(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
        )
    elif sort_key == "confirmacao_asc":
        return query.order_by(
            Occurrence.ultima_confirmacao_em.asc().nulls_last(),
            Occurrence.abertura_timestamp.asc().nulls_last(),
        )
    elif sort_key == "atividade_desc":
        return query.order_by(
            func.coalesce(Occurrence.ultima_confirmacao_em, Occurrence.abertura_timestamp).desc().nulls_last(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
        )
    elif sort_key == "arvore_asc":
        return query.order_by(
            Occurrence.arvore_planta.asc().nulls_last(),
            Occurrence.posicao_funcional.asc().nulls_last(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
            Occurrence.numero_ordem.asc().nulls_last(),
        )
    elif sort_key == "arvore_desc":
        return query.order_by(
            Occurrence.arvore_planta.desc().nulls_last(),
            Occurrence.posicao_funcional.desc().nulls_last(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
        )
    elif sort_key == "arvore_abertura_asc":
        return query.order_by(
            Occurrence.arvore_planta.asc().nulls_last(),
            Occurrence.posicao_funcional.asc().nulls_last(),
            Occurrence.abertura_timestamp.asc().nulls_last(),
            Occurrence.numero_ordem.asc().nulls_last(),
        )
    elif sort_key == "data_desc_arvore":
        return query.order_by(
            Occurrence.data_abertura.desc().nulls_last(),
            Occurrence.arvore_planta.asc().nulls_last(),
            Occurrence.posicao_funcional.asc().nulls_last(),
            Occurrence.hora_abertura.asc().nulls_last(),
            Occurrence.numero_ordem.asc().nulls_last(),
        )
    elif sort_key == "data_asc_arvore":
        return query.order_by(
            Occurrence.data_abertura.asc().nulls_last(),
            Occurrence.arvore_planta.asc().nulls_last(),
            Occurrence.posicao_funcional.asc().nulls_last(),
            Occurrence.hora_abertura.asc().nulls_last(),
            Occurrence.numero_ordem.asc().nulls_last(),
        )
    elif sort_key == "pane_desc":
        return query.order_by(
            Occurrence.duracao_pane_min.desc(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
        )
    elif sort_key == "relevance":
        return query.order_by(
            Occurrence.flag_destaque_reuniao.desc(),
            Occurrence.flag_relevante.desc(),
            Occurrence.flag_analisar.desc(),
            Occurrence.abertura_timestamp.desc().nulls_last(),
        )
    else:  # abertura_desc default
        return query.order_by(
            Occurrence.abertura_timestamp.desc().nulls_last(),
            Occurrence.numero_ordem.desc().nulls_last(),
        )
