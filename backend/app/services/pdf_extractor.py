"""
ATC Vision — SAP PM shift-report extraction engine.

Pipeline
--------
1. ``extract_line_tokens``  : PyMuPDF spans -> visual lines (``LineToken``) with page + bbox and
                              per-span character offsets (so any substring can be mapped back to a
                              rectangle on the page).
2. ``clean_and_stitch``     : removes page noise (page-1 header, pagination footers, repeated
                              "Lista de objetos" table headers) and concatenates every page into a
                              single continuous stream -> records crossing page breaks stay intact.
3. ``segment_records``      : finds the 4 SAP PM record openings (Corretiva, Notificação geral,
                              Preventiva por condição, Preventiva tempo/contador) incl. edge rule
                              "nota number printed one line ABOVE the marker".
4. ``parse_record``         : label/section driven field extraction + normalisation, producing a
                              ``ParsedOccurrence`` whose ``field_bboxes`` drive Click-to-Highlight.

OCR: ``ensure_text_layer`` detects image-only PDFs and runs OCRmyPDF (Tesseract por+eng) via
``subprocess.run([...], shell=False)``. The OCR output PDF becomes the *viewable* file so
coordinates always match what the user sees.

The module has no DB dependency and can be used as a CLI for calibration with real reports:

    python -m app.services.pdf_extractor relatorio.pdf --dump-lines --json
"""
from __future__ import annotations

import dataclasses
import json
import logging
import re
import shutil
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Iterable

try:
    import pymupdf as fitz
except ImportError:
    import fitz

log = logging.getLogger("atc.extractor")

# --------------------------------------------------------------------------------------------
# Regex catalogue (kept together so it can be calibrated against real SAP PM layouts)
# --------------------------------------------------------------------------------------------
NOTE_RE = re.compile(r"(?<![\d.])(900005(?:\.?\d){6})(?![\d])")
ORDER_RE = re.compile(r"(?<![\d.])(900039(?:\.?\d){6})(?![\d])")
LEAD_NUMBER_RE = re.compile(r"^\s*(9000(?:05|39)(?:\.?\d){6})(?!\d)")
FL_CODE_RE = re.compile(r"\b(BT-ST-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b")
DATE_RE = r"(\d{2}\.\d{2}\.\d{4})"
TIME_RE = r"(\d{1,2}:\d{2}(?::\d{2})?)"
DATETIME_RE = re.compile(DATE_RE + r"\s+" + TIME_RE)

TIPO_CORRETIVA = "CORRETIVA"
TIPO_NOTIF_GERAL = "NOTIFICACAO_GERAL"
TIPO_PREV_COND = "PREVENTIVA_CONDICAO"
TIPO_PREV_TEMPO = "PREVENTIVA_TEMPO"

# Order matters: the most specific marker first.
TYPE_MARKERS: list[tuple[str, re.Pattern[str]]] = [
    (TIPO_PREV_TEMPO, re.compile(r"Manut\.?\s*Prev\.?\s*\(?\s*tempo\s*/\s*contador\s*\)?", re.I)),
    (TIPO_CORRETIVA, re.compile(r"Manut\.?\s*Corr\.?\s*[-–]?\s*Mau\s*func\.?", re.I)),
    (TIPO_NOTIF_GERAL, re.compile(r"Notifica[çc][ãa]o\s+geral", re.I)),
    (TIPO_PREV_COND, re.compile(r"(?:Manut\.?\s*Prev\.?\s*[-–]?\s*)?Bas\.?\s*Co(?:nd\w*)?\.?|Manut\.?\s*Prev\.?(?!\s*\(?\s*tempo)", re.I)),
]

# Inline "Label: value" fields. Values end at the next known label on the same line.
LABELS: dict[str, re.Pattern[str]] = {
    "ordem": re.compile(r"\b(?:N[ºo°]\s*(?:da\s+)?)?Ordem\s*:", re.I),
    "nota": re.compile(r"\b(?:N[ºo°]\s*(?:da\s+)?)?Nota\s*:", re.I),
    "status": re.compile(r"\bStatus(?:\s+(?:da\s+ordem|do\s+sistema|usu[áa]rio|da\s+nota))?\s*:", re.I),
    "prioridade": re.compile(r"\bPrioridade\s*:", re.I),
    "tipo_ordem": re.compile(r"\bTipo\s+(?:de\s+)?ordem\s*:", re.I),
    "data_abertura": re.compile(r"\bData\s+(?:da|de)\s+abertura\s*:?", re.I),
    "creation_time": re.compile(r"\bCreation\s+Time\s*:?", re.I),
    "data_inicio": re.compile(r"\bData\s+(?:de\s+)?in[íi]cio\s*:?", re.I),
    "hora_inicio": re.compile(r"\bHora\s+(?:de\s+)?in[íi]cio\s*:?", re.I),
    "turno": re.compile(r"\bTurno\s*:", re.I),
    "reportado_por_pessoa": re.compile(r"\bReportado\s+por\s*\(\s*pessoa\s*\)\s*:?", re.I),
    "reportado_por": re.compile(r"\bReportado\s+por\s*:", re.I),
    "centro_trabalho": re.compile(r"\bCentro\s+(?:de\s+)?trabalho\s*:?", re.I),
    "grupo_planejamento": re.compile(r"\bGrupo\s+(?:de\s+)?planej(?:amento|\.)?\s*:?", re.I),
    "posicao_funcional": re.compile(r"\bPosi[çc][ãa]o\s+funcional\s*:", re.I),
    "equipamento": re.compile(r"\bEquipamento\s*:", re.I),
    "parte_objeto": re.compile(r"\bParte\s+(?:do\s+)?objeto\s*:", re.I),
    "defeito": re.compile(r"\b(?:C[óo]d(?:igo|\.)?\s+(?:de\s+|do\s+)?)?(?:Defeito|Sintoma|Dano)\s*:", re.I),
    "causa": re.compile(r"\b(?:C[óo]d(?:igo|\.)?\s+(?:de\s+|da\s+)?)?Causa(?:\s+raiz)?\s*:", re.I),
    "observacao": re.compile(r"\bObserva[çc](?:[ãa]o|[õo]es)\s*:", re.I),
    "inicio_avaria": re.compile(r"\bIn[íi]cio\s+(?:da\s+)?avaria\s*:?", re.I),
    "fim_avaria": re.compile(r"\bFim\s+(?:da\s+)?avaria\s*:?", re.I),
    "duracao_avaria": re.compile(r"\bDura[çc][ãa]o\s+(?:da\s+)?avaria\s*:?", re.I),
    "duracao_pane": re.compile(r"\b(?:Dura[çc][ãa]o|Tempo)\s+(?:da\s+|de\s+)?(?:pane|parada)\s*:?", re.I),
    "pane": re.compile(r"\b(?:Houve\s+)?(?:Pane|Parada(?:\s+de\s+(?:m[áa]quina|equipamento))?)\s*\??\s*:", re.I),
}
HEADER_META_LABELS = {
    "ordem", "nota", "status", "prioridade", "tipo_ordem", "data_abertura", "creation_time", "data_inicio",
    "hora_inicio", "turno", "reportado_por_pessoa", "reportado_por", "centro_trabalho", "grupo_planejamento",
}

# Multi-line section headings (start of line).
SECTIONS: list[tuple[str, re.Pattern[str]]] = [
    ("desc_notif", re.compile(r"^\s*Descri[çc][ãa]o\s+longa\s+da\s+notifica[çc][ãa]o\s*:?", re.I)),
    ("desc_ordem", re.compile(r"^\s*Descri[çc][ãa]o\s+longa\s+da\s+ordem(?:\s+de\s+manuten[çc][ãa]o)?\s*:?", re.I)),
    ("objetos", re.compile(r"^\s*Lista\s+de\s+objetos\s*:?", re.I)),
    ("tarefas", re.compile(r"^\s*(?:Lista\s+de\s+)?Tarefas\s*:?\s*$", re.I)),
    ("operacoes", re.compile(r"^\s*Opera[çc](?:[ãa]o|[õo]es)\s*:?\s*$", re.I)),
    ("confirmacoes", re.compile(r"^\s*Confirma[çc][õo]es\s*:?", re.I)),
    ("avaria", re.compile(r"^\s*(?:In[íi]cio\s+(?:da\s+)?avaria|Dados\s+(?:da\s+)?avaria)\b", re.I)),
]
JUMP_RE = re.compile(r"By\s*-?\s*pass\s+ou\s+Jumps?\s+Anormai?s?\s*:?", re.I)
OPERATION_ROW_RE = re.compile(r"^\s*(?:Opera[çc][ãa]o\s*:?\s*)?(0\d{2}0)\b\s*[-–:]?\s*(.*)$")
CONFIRM_ROW_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*MIN\b", re.I)
NEGATIVE_VALUE_RE = re.compile(r"^\s*(?:n[ãa]o|nao|n|na|n/a|nenhum[a]?|sem|-+|0|x?\s*n[ãa]o)\s*\.?\s*$", re.I)
POSITIVE_FLAG_RE = re.compile(r"^\s*(?:sim|s|x|yes|\[x\]|☒|✔|✓)\b", re.I)
JUMP_KEYWORD_RE = re.compile(
    r"\b(jump\w*|jumper\w*|by-?\s?pass\w*|forces?|for[çc]ad[oa]s?|for[çc]amento|for[çc]ou)\b", re.I)
PANE_TITLE_RE = re.compile(r"\bpane\b", re.I)
NEGATION_BEFORE_RE = re.compile(r"(sem|n[ãa]o|nao|nenhum[a]?|retirad[oa]s?|removid[oa]s?)\W+(?:\w+\W+){0,2}$", re.I)
SAP_STATUS_RE = re.compile(
    r"\b(ABER|LIB|LIBE|ENTE|ENCE|ENTP|IMPR|CAPC|CONF|CNF|MSPN|NOPR|ORAS|NOCO|MDOC|ATRI|PREC|CDES|EMEX|ENCT|PLAN|AGPR)\b")

# Page noise
HDR_COMPANY_RE = re.compile(r"^\s*ArcelorMittal\b", re.I)
HDR_TITLE_RE = re.compile(r"^\s*Relat[óo]rio\s+(?:di[áa]rio\s+)?de\s+turno\s*:?", re.I)
HDR_DATA_RE = re.compile(r"^\s*Data\s*:\s*\d{2}\.\d{2}\.\d{4}", re.I)
HDR_STAMP_RE = re.compile(
    r"^\s*(?:(?:Emitido|Impresso|Emiss[ãa]o|Data\s+de\s+emiss[ãa]o)\s*(?:em|por)?\s*:?\s*)?"
    + DATE_RE + r"\s*(?:[-–,às]+\s*)?" + TIME_RE + r"?\s*$", re.I)
HDR_STAMP_LABELED_RE = re.compile(r"^\s*(?:Emitido|Impresso|Emiss[ãa]o)\b.*\d{2}\.\d{2}\.\d{4}", re.I)
FOOTER_FRACTION_RE = re.compile(r"^\s*(?:P[áa]g(?:ina)?\.?\s*)?\d{1,3}\s*(?:/|de)\s*\d{1,3}\s*$", re.I)
FOOTER_NUMBER_RE = re.compile(r"^\s*(?:P[áa]g(?:ina)?\.?\s*)?\d{1,3}\s*$", re.I)
TABLE_HEADER_RE = re.compile(r"Ordenar\b.*Posi[çc][ãa]o\s+funcional.*Descri", re.I)
CONFIRM_HEADER_RE = re.compile(r"\b(Nome|Executante)\b.*\bDura[çc][ãa]o\b|\bN[ºo°]\s*pessoal\b", re.I)

FL_PREFIX_FIXES = {
    "BT-ST-COMO": "BT-ST-COM0",
    "BT-ST-CCSO": "BT-ST-CCS0",
    "BT-ST-CCSI": "BT-ST-CCS1",
    "BT-ST-SLMI": "BT-ST-SLM1",
    "BT-ST-BOFI": "BT-ST-BOF1",
    "BT-ST-PCCI": "BT-ST-PCC1",
    "BT-ST-SLML": "BT-ST-SLM1",
    "BT-ST-BOFL": "BT-ST-BOF1",
    "BT-ST-PCCL": "BT-ST-PCC1",
}
TIPO_LABELS = {
    TIPO_CORRETIVA: "Corretiva",
    TIPO_NOTIF_GERAL: "Notificação Geral",
    TIPO_PREV_COND: "Preventiva Condicional",
    TIPO_PREV_TEMPO: "Preventiva Tempo/Contador",
}

DEFAULT_SPECIALTY_RULES: dict[str, list[str]] = {
    "ELETRICA": ["STGEET", "ELET", "AUTOM", "058/AT00"],
    "MECANICA": ["STGEMT", "MEC", "184/AT00", "068/AT00"],
}


# --------------------------------------------------------------------------------------------
# Data structures
# --------------------------------------------------------------------------------------------
BBox = tuple[float, float, float, float]


@dataclass
class Span:
    start: int
    end: int
    bbox: BBox


@dataclass
class LineToken:
    text: str
    page: int  # 1-based
    bbox: BBox
    spans: list[Span] = field(default_factory=list)
    idx: int = -1  # position in the stitched stream

    def sub_bbox(self, start: int, end: int) -> BBox:
        """Rectangle covering text[start:end] (proportional inside spans)."""
        if start <= 0 and end >= len(self.text) or not self.spans:
            return self.bbox
        xs0, xs1, ys0, ys1 = [], [], [], []
        for sp in self.spans:
            if sp.end <= start or sp.start >= end:
                continue
            w = sp.bbox[2] - sp.bbox[0]
            n = max(sp.end - sp.start, 1)
            a = max(start, sp.start) - sp.start
            b = min(end, sp.end) - sp.start
            xs0.append(sp.bbox[0] + w * a / n)
            xs1.append(sp.bbox[0] + w * b / n)
            ys0.append(sp.bbox[1])
            ys1.append(sp.bbox[3])
        if not xs0:
            return self.bbox
        return (min(xs0), min(ys0), max(xs1), max(ys1))


@dataclass
class FieldLoc:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float

    def as_dict(self) -> dict[str, float]:
        return {"page": self.page, "x0": round(self.x0, 1), "y0": round(self.y0, 1),
                "x1": round(self.x1, 1), "y1": round(self.y1, 1)}


@dataclass
class ParsedConfirmation:
    data_execucao: date | None
    hora_execucao: time | None
    centro_trabalho: str | None
    matricula: str | None
    nome_executante: str | None
    duracao_min: int


@dataclass
class ParsedOccurrence:
    tipo_ocorrencia: str
    numero_nota: str | None = None
    numero_ordem: str | None = None
    titulo: str = ""
    status_ordem: str | None = None
    prioridade_sap: str | None = None
    tipo_ordem_sap: str | None = None
    data_abertura: date | None = None
    hora_abertura: time | None = None
    turno: str | None = None
    grupo_planejamento: str | None = None
    reportado_por_id: str | None = None
    reportado_por_nome: str | None = None
    especialidade: str = "OUTRA"
    posicao_funcional: str | None = None
    arvore_planta: str | None = None
    descricao_posicao_funcional: str | None = None
    descricao_curta_objeto: str | None = None
    equipamento_codigo: str | None = None
    equipamento_descricao: str | None = None
    descricao_longa_notificacao: str | None = None
    descricao_longa_ordem: str | None = None
    texto_confirmacao: str | None = None
    defeito: str | None = None
    causa: str | None = None
    observacoes_objeto: str | None = None
    inicio_avaria: datetime | None = None
    fim_avaria: datetime | None = None
    duracao_avaria_min: float | None = None
    teve_pane: bool = False
    duracao_pane_min: float = 0.0
    tem_jump_force: bool = False
    jump_origem: str | None = None  # LABEL | KEYWORD
    detalhe_jump_tarefas: str | None = None
    hh_total_minutos: int = 0
    quantidade_executantes: int = 0
    operacoes: list[dict[str, str]] = field(default_factory=list)
    objetos: list[dict[str, str | None]] = field(default_factory=list)
    confirmations: list[ParsedConfirmation] = field(default_factory=list)
    field_bboxes: dict[str, list[dict[str, float]]] = field(default_factory=dict)
    start_page: int = 1
    end_page: int = 1
    warnings: list[str] = field(default_factory=list)

    @property
    def abertura_timestamp(self) -> datetime | None:
        if self.data_abertura is None:
            return None
        return datetime.combine(self.data_abertura, self.hora_abertura or time(0, 0))

    @property
    def unique_sap_key(self) -> str | None:
        if self.numero_ordem:
            return self.numero_ordem
        if self.numero_nota:
            return f"N{self.numero_nota}"
        return None

    def to_dict(self) -> dict[str, Any]:
        d = dataclasses.asdict(self)
        d["abertura_timestamp"] = self.abertura_timestamp
        d["unique_sap_key"] = self.unique_sap_key
        return d


@dataclass
class ExtractionResult:
    occurrences: list[ParsedOccurrence]
    page_count: int
    page_sizes: list[dict[str, float]]
    report_period_start: datetime | None = None
    report_period_end: datetime | None = None
    emitted_at: datetime | None = None
    report_title: str | None = None
    ocr_applied: bool = False
    warnings: list[str] = field(default_factory=list)
    lines: list[LineToken] = field(default_factory=list)


# --------------------------------------------------------------------------------------------
# Normalisation helpers
# --------------------------------------------------------------------------------------------
def clean_spaces(s: str | None) -> str:
    if not s:
        return ""
    s = s.replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"[ \t]+", " ", s).strip()


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalize_number(raw: str | None) -> str | None:
    """'90003949961.0' -> '900039499610'. Returns None if not a 12-digit SAP number."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    return digits if len(digits) == 12 else None


def normalize_functional_location(code: str | None) -> str | None:
    if not code:
        return None
    code = clean_spaces(code).upper().rstrip("-.,;:")
    for wrong, right in FL_PREFIX_FIXES.items():
        if code.startswith(wrong):
            code = right + code[len(wrong):]
            break
    return code


def arvore_from_fl(code: str | None) -> str | None:
    if not code:
        return None
    parts = code.split("-")
    return parts[2] if len(parts) > 2 and parts[2] else None


_PG_RE = re.compile(r"(\d{3})\s*/?\s*([A-Z0-9]{2,4})", re.I)


def normalize_planning_group(raw: str | None) -> str | None:
    """'058/ ATOO' | '184/ AT0O' | '068 ATOO' -> '058/AT00'."""
    if not raw:
        return None
    m = _PG_RE.search(raw.upper())
    if not m:
        return clean_spaces(raw) or None
    num, grp = m.group(1), m.group(2)
    if len(grp) == 4:
        grp = grp[:2] + grp[2:].replace("O", "0").replace("Q", "0").replace("D", "0")
    return f"{num}/{grp}"


def normalize_turno(raw: str | None) -> str | None:
    s = clean_spaces(raw)
    if not s:
        return None
    m = re.match(r"^(?:Turno\s*)?([A-D])\b(?!\s*[-–]?\s*Dia)", s, re.I)
    if re.match(r"^D\s*[-–]?\s*Dia\b", s, re.I):
        return "D Dia"
    if re.match(r"^N\s*[-–]?\s*Noite\b", s, re.I):
        return "N Noite"
    if m:
        return f"Turno {m.group(1).upper()}"
    return s[:40]


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    m = re.search(DATE_RE, s)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%d.%m.%Y").date()
    except ValueError:
        return None


def parse_time(s: str | None) -> time | None:
    if not s:
        return None
    m = re.search(TIME_RE, s)
    if not m:
        return None
    parts = [int(p) for p in m.group(1).split(":")]
    try:
        return time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)
    except ValueError:
        return None


def parse_datetime(s: str | None) -> datetime | None:
    if not s:
        return None
    m = DATETIME_RE.search(s)
    if m:
        d, t = parse_date(m.group(1)), parse_time(m.group(2))
        if d:
            return datetime.combine(d, t or time(0, 0))
    d = parse_date(s)
    return datetime.combine(d, time(0, 0)) if d else None


def parse_minutes(s: str | None) -> float | None:
    """'90 MIN' | '1,5 H' | '01:30' -> minutes."""
    if not s:
        return None
    s = s.strip()
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(MIN|M\b|H|HR|HRS|HORAS?)?", s, re.I)
    hm = re.search(r"\b(\d{1,3}):(\d{2})\b", s)
    if hm and not re.search(DATE_RE, s):
        return int(hm.group(1)) * 60 + int(hm.group(2))
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    unit = (m.group(2) or "MIN").upper()
    return v * 60 if unit.startswith("H") else v


def infer_specialty(reportado_por_id: str | None, centro: str | None, planning_group: str | None,
                    confirm_centers: Iterable[str], rules: dict[str, list[str]] | None = None) -> str:
    rules = rules or DEFAULT_SPECIALTY_RULES

    def match(value: str | None) -> str | None:
        if not value:
            return None
        v = strip_accents(value).upper()
        for spec, keys in rules.items():
            for k in keys:
                if k and strip_accents(k).upper() in v:
                    return spec
        return None

    for candidate in (reportado_por_id, centro):
        r = match(candidate)
        if r:
            return r
    counts: dict[str, int] = {}
    for c in confirm_centers:
        r = match(c)
        if r:
            counts[r] = counts.get(r, 0) + 1
    if counts:
        return max(counts.items(), key=lambda kv: kv[1])[0]
    return match(planning_group) or "OUTRA"


# --------------------------------------------------------------------------------------------
# Stage 1: PDF -> LineTokens
# --------------------------------------------------------------------------------------------
def _page_spans(page: fitz.Page) -> list[tuple[str, BBox]]:
    out: list[tuple[str, BBox]] = []
    d = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_MEDIABOX_CLIP)
    mat = page.rotation_matrix if page.rotation else None
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                txt = sp.get("text", "")
                if not txt.strip():
                    continue
                r = fitz.Rect(sp["bbox"])
                if mat is not None:
                    r = r * mat
                out.append((txt, (r.x0, r.y0, r.x1, r.y1)))
    return out


def _cluster_lines(spans: list[tuple[str, BBox]], page_no: int) -> list[LineToken]:
    """Group spans into visual lines by vertical overlap, then order left->right."""
    spans = sorted(spans, key=lambda s: ((s[1][1] + s[1][3]) / 2, s[1][0]))
    rows: list[list[tuple[str, BBox]]] = []
    row_box: list[list[float]] = []
    for txt, bb in spans:
        cy = (bb[1] + bb[3]) / 2
        h = max(bb[3] - bb[1], 1.0)
        placed = False
        for i in range(len(rows) - 1, max(len(rows) - 4, -1), -1):
            ry0, ry1 = row_box[i]
            rh = max(ry1 - ry0, 1.0)
            if abs(cy - (ry0 + ry1) / 2) <= 0.45 * min(h, rh):
                rows[i].append((txt, bb))
                row_box[i] = [min(ry0, bb[1]), max(ry1, bb[3])]
                placed = True
                break
        if not placed:
            rows.append([(txt, bb)])
            row_box.append([bb[1], bb[3]])

    lines: list[LineToken] = []
    for row in rows:
        row.sort(key=lambda s: s[1][0])
        text = ""
        span_objs: list[Span] = []
        prev_x1 = None
        for txt, bb in row:
            piece = txt.strip()
            h = max(bb[3] - bb[1], 1.0)
            if text:
                gap = bb[0] - (prev_x1 or bb[0])
                text += "  " if gap > 2.5 * h else " "
            start = len(text)
            text += piece
            # shrink bbox proportionally if we stripped whitespace
            lead = len(txt) - len(txt.lstrip())
            n = max(len(txt), 1)
            w = bb[2] - bb[0]
            x0 = bb[0] + w * lead / n
            x1 = x0 + w * len(piece) / n
            span_objs.append(Span(start, len(text), (x0, bb[1], x1, bb[3])))
            prev_x1 = bb[2]
        x0 = min(s.bbox[0] for s in span_objs)
        y0 = min(s.bbox[1] for s in span_objs)
        x1 = max(s.bbox[2] for s in span_objs)
        y1 = max(s.bbox[3] for s in span_objs)
        lines.append(LineToken(text=text, page=page_no, bbox=(x0, y0, x1, y1), spans=span_objs))
    lines.sort(key=lambda ln: (ln.bbox[1], ln.bbox[0]))
    return lines


def extract_line_tokens(doc: fitz.Document) -> tuple[list[list[LineToken]], list[dict[str, float]]]:
    pages: list[list[LineToken]] = []
    sizes: list[dict[str, float]] = []
    for pno in range(doc.page_count):
        page = doc[pno]
        sizes.append({"w": round(page.rect.width, 2), "h": round(page.rect.height, 2)})
        pages.append(_cluster_lines(_page_spans(page), pno + 1))
    return pages, sizes


# --------------------------------------------------------------------------------------------
# Stage 2: noise removal + stitching
# --------------------------------------------------------------------------------------------
@dataclass
class HeaderInfo:
    report_title: str | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    emitted_at: datetime | None = None


def clean_and_stitch(pages: list[list[LineToken]], sizes: list[dict[str, float]]) -> tuple[list[LineToken], HeaderInfo]:
    info = HeaderInfo()
    stream: list[LineToken] = []
    header_texts: list[str] = []
    for pi, lines in enumerate(pages):
        h = sizes[pi]["h"] or 842
        top_zone, bottom_zone = 0.16 * h, 0.90 * h
        n = len(lines)
        keep: list[LineToken] = []
        for li, ln in enumerate(lines):
            t = ln.text.strip()
            in_top = ln.bbox[3] <= top_zone
            in_bottom = ln.bbox[1] >= bottom_zone
            if not t:
                continue
            # --- headers (page 1 and repeated page headers) ---
            if in_top and (HDR_COMPANY_RE.search(t) or HDR_TITLE_RE.search(t) or HDR_DATA_RE.search(t)
                           or HDR_STAMP_LABELED_RE.search(t) or HDR_STAMP_RE.match(t)):
                if pi == 0:
                    header_texts.append(t)
                    if HDR_TITLE_RE.search(t):
                        info.report_title = clean_spaces(HDR_TITLE_RE.search(t).group(0).rstrip(":"))  # type: ignore[union-attr]
                continue
            # --- pagination footers ---
            if in_bottom and li >= n - 3 and (FOOTER_FRACTION_RE.match(t) or FOOTER_NUMBER_RE.match(t)):
                continue
            # --- repeated table header of "Lista de objetos" ---
            if TABLE_HEADER_RE.search(t):
                continue
            keep.append(ln)
        stream.extend(keep)

    # header metadata
    htxt = " ".join(header_texts)
    m = re.search(r"Data\s*:\s*(.*)$", htxt, re.I)
    period_dts = DATETIME_RE.findall(m.group(1)) if m else []
    if len(period_dts) >= 2:
        info.period_start = parse_datetime(" ".join(period_dts[0]))
        info.period_end = parse_datetime(" ".join(period_dts[1]))
    elif len(period_dts) == 1:
        info.period_start = parse_datetime(" ".join(period_dts[0]))
    before = htxt[: m.start()] if m else htxt
    stamp = DATETIME_RE.findall(before)
    if stamp:
        info.emitted_at = parse_datetime(" ".join(stamp[0]))
    elif len(period_dts) >= 3:
        info.emitted_at = parse_datetime(" ".join(period_dts[2]))

    for i, ln in enumerate(stream):
        ln.idx = i
    return stream, info


# --------------------------------------------------------------------------------------------
# Stage 3: segmentation
# --------------------------------------------------------------------------------------------
def _find_marker(text: str) -> tuple[str, re.Match[str]] | None:
    for tipo, rx in TYPE_MARKERS:
        mm = rx.search(text)
        if mm:
            return tipo, mm
    return None


def segment_records(stream: list[LineToken]) -> list[tuple[str, int, int, int]]:
    """Return list of (tipo, start_idx, marker_idx, end_idx_exclusive)."""
    cands: list[tuple[str, int, int]] = []
    for i, ln in enumerate(stream):
        found = _find_marker(ln.text)
        if not found:
            continue
        tipo, mm = found
        lead_here = bool(LEAD_NUMBER_RE.match(ln.text))
        lead_prev = any(LEAD_NUMBER_RE.match(stream[j].text) for j in range(max(0, i - 2), i))
        if not (mm.start() <= 3 or lead_here or lead_prev):
            continue
        window = " ".join(stream[j].text for j in range(max(0, i - 2), min(len(stream), i + 12)))
        if not (ORDER_RE.search(window) or NOTE_RE.search(window)):
            continue
        start = i
        if not lead_here:
            for j in range(i - 1, max(-1, i - 3), -1):
                if cands and j <= cands[-1][2]:
                    break
                if LEAD_NUMBER_RE.match(stream[j].text):
                    start = j
                    break
        if cands and start <= cands[-1][2]:
            # marker inside the header of the previous record (e.g. 'Manut. Prev.' printed twice)
            continue
        cands.append((tipo, start, i))
    out = []
    for k, (tipo, s, mi) in enumerate(cands):
        e = cands[k + 1][1] if k + 1 < len(cands) else len(stream)
        out.append((tipo, s, mi, e))
    return out


# --------------------------------------------------------------------------------------------
# Stage 4: field extraction
# --------------------------------------------------------------------------------------------
@dataclass
class LabelHit:
    key: str
    line: LineToken
    lstart: int
    vstart: int
    vend: int

    @property
    def value(self) -> str:
        return clean_spaces(self.line.text[self.vstart:self.vend])


def scan_labels(line: LineToken, keys: Iterable[str] | None = None) -> list[LabelHit]:
    keys = list(keys) if keys is not None else list(LABELS)
    found: list[tuple[int, int, str]] = []
    for k in keys:
        for mm in LABELS[k].finditer(line.text):
            found.append((mm.start(), mm.end(), k))
    # "Reportado por (pessoa):" also matches nothing in 'reportado_por' (needs ':' right after 'por'),
    # but generic overlaps are removed here: keep the longest match at each position.
    found.sort(key=lambda f: (f[0], -(f[1] - f[0])))
    cleaned: list[tuple[int, int, str]] = []
    for f in found:
        if cleaned and f[0] < cleaned[-1][1]:
            continue
        cleaned.append(f)
    hits = []
    for i, (s, e, k) in enumerate(cleaned):
        vend = cleaned[i + 1][0] if i + 1 < len(cleaned) else len(line.text)
        hits.append(LabelHit(k, line, s, e, vend))
    return hits


def _merge_locs(items: list[tuple[int, BBox]]) -> list[dict[str, float]]:
    """Merge rectangles of consecutive lines on the same page into blocks."""
    out: list[FieldLoc] = []
    for page, bb in items:
        if out and out[-1].page == page:
            last = out[-1]
            lh = max(bb[3] - bb[1], 4.0)
            if bb[1] - last.y1 <= 1.6 * lh and bb[1] >= last.y0 - 2:
                last.x0, last.y0 = min(last.x0, bb[0]), min(last.y0, bb[1])
                last.x1, last.y1 = max(last.x1, bb[2]), max(last.y1, bb[3])
                continue
        out.append(FieldLoc(page, *bb))
    return [o.as_dict() for o in out]


def _line_locs(lines: list[LineToken]) -> list[dict[str, float]]:
    return _merge_locs([(ln.page, ln.bbox) for ln in lines])


def _negated(text: str, pos: int) -> bool:
    return bool(NEGATION_BEFORE_RE.search(text[max(0, pos - 30):pos]))


class RecordParser:
    def __init__(self, tipo: str, lines: list[LineToken], marker_rel: int,
                 specialty_rules: dict[str, list[str]] | None = None):
        self.tipo = tipo
        self.lines = lines
        self.marker_rel = marker_rel
        self.rules = specialty_rules
        self.o = ParsedOccurrence(tipo_ocorrencia=tipo)
        self.boxes: dict[str, list[tuple[int, BBox]]] = {}

    # -- bbox helpers --
    def add_box(self, key: str, line: LineToken, start: int | None = None, end: int | None = None) -> None:
        bb = line.bbox if start is None else line.sub_bbox(start, end if end is not None else len(line.text))
        self.boxes.setdefault(key, []).append((line.page, bb))

    def add_lines(self, key: str, lines: list[LineToken]) -> None:
        for ln in lines:
            self.add_box(key, ln)

    # -- sectioning --
    def split_sections(self) -> tuple[list[LineToken], list[tuple[str, LineToken, list[LineToken]]]]:
        header: list[LineToken] = []
        sections: list[tuple[str, LineToken, list[LineToken]]] = []
        current: tuple[str, LineToken, list[LineToken]] | None = None
        for k, ln in enumerate(self.lines):
            kind = None
            if k > self.marker_rel:
                for sk, rx in SECTIONS:
                    if rx.search(ln.text):
                        kind = sk
                        break
                if kind is None and JUMP_RE.search(ln.text):
                    kind = "jump"
                if kind is None and OPERATION_ROW_RE.match(ln.text) and current and current[0] in ("desc_ordem", "operacoes", "op"):
                    kind = "op"
            if kind:
                current = (kind, ln, [])
                sections.append(current)
            elif current is None:
                header.append(ln)
            else:
                current[2].append(ln)
        return header, sections

    def parse(self) -> ParsedOccurrence:
        o = self.o
        header, sections = self.split_sections()
        self.parse_header(header)
        objetos_text_lines: list[LineToken] = []
        for kind, head, body in sections:
            if kind == "desc_notif":
                self.parse_long_text("descricao_longa_notificacao", head, body)
            elif kind == "desc_ordem":
                self.parse_long_text("descricao_longa_ordem", head, body)
            elif kind == "objetos":
                objetos_text_lines.extend(body)
                self.parse_objetos(head, body)
            elif kind in ("operacoes", "op"):
                self.parse_operations(head, body)
            elif kind == "confirmacoes":
                self.parse_confirmations(head, body)
            elif kind == "jump":
                self.parse_jump(head, body)
            elif kind == "avaria":
                self.parse_avaria([head] + body)
            elif kind == "tarefas":
                self.parse_generic_labels(body)
        self.finalize()
        return o

    # -- header (metadata + posição funcional) --
    def parse_header(self, header: list[LineToken]) -> None:
        o = self.o
        lines = header
        marker_line = self.lines[self.marker_rel]

        # Numbers
        for ln in lines[: self.marker_rel + 3]:
            if o.numero_nota is None:
                mm = NOTE_RE.search(ln.text)
                if mm:
                    o.numero_nota = normalize_number(mm.group(1))
                    self.add_box("numero_nota", ln, mm.start(1), mm.end(1))
        hits: list[LabelHit] = []
        for ln in lines:
            hits.extend(scan_labels(ln))
        by_key: dict[str, LabelHit] = {}
        for h in hits:
            by_key.setdefault(h.key, h)

        if "ordem" in by_key:
            mm = ORDER_RE.search(by_key["ordem"].value) or ORDER_RE.search(by_key["ordem"].line.text)
            if mm:
                o.numero_ordem = normalize_number(mm.group(1))
                h = by_key["ordem"]
                self.add_box("numero_ordem", h.line, h.lstart, h.vend)
        if o.numero_ordem is None:
            for ln in lines:
                mm = ORDER_RE.search(ln.text)
                if mm:
                    o.numero_ordem = normalize_number(mm.group(1))
                    self.add_box("numero_ordem", ln, mm.start(1), mm.end(1))
                    break
        if o.numero_nota is None and "nota" in by_key and self.tipo != TIPO_PREV_TEMPO:
            mm = NOTE_RE.search(by_key["nota"].value)
            if mm:
                o.numero_nota = normalize_number(mm.group(1))
                self.add_box("numero_nota", by_key["nota"].line, by_key["nota"].lstart, by_key["nota"].vend)

        # Title: lines from record start to marker line, stripped of numbers/markers/labels
        title_parts: list[str] = []
        for k in range(0, self.marker_rel + 1):
            ln = self.lines[k]
            t = ln.text
            cut_end = len(t)
            if k == self.marker_rel:
                fm = _find_marker(t)
                if fm:
                    cut_end = fm[1].start()
                    after = clean_spaces(t[fm[1].end():])
                    self.add_box("tipo", ln, fm[1].start(), fm[1].end())
                    self._parse_marker_tail(after)
            lh = scan_labels(ln)
            if lh:
                cut_end = min(cut_end, lh[0].lstart)
            seg = t[:cut_end]
            seg_clean = LEAD_NUMBER_RE.sub("", seg)
            seg_clean = clean_spaces(seg_clean.strip(" -–|:"))
            if seg_clean and not re.fullmatch(r"(Imediat[oa]|Geral|Prioridade.*)", seg_clean, re.I):
                title_parts.append(seg_clean)
                off = t.find(seg_clean)
                self.add_box("titulo", ln, off, off + len(seg_clean))
        if not title_parts and self.marker_rel + 1 < len(self.lines):
            nxt = self.lines[self.marker_rel + 1]
            if not scan_labels(nxt) and not FL_CODE_RE.search(nxt.text):
                title_parts.append(clean_spaces(nxt.text))
                self.add_box("titulo", nxt)
        o.titulo = clean_spaces(" ".join(title_parts))[:500] or "(sem título)"

        # Simple labels
        def val(key: str) -> str | None:
            h = by_key.get(key)
            return h.value if h else None

        def box(key: str, field_key: str) -> None:
            h = by_key.get(key)
            if h:
                self.add_box(field_key, h.line, h.lstart, h.vend)

        if val("status"):
            o.status_ordem = val("status")[:120]
            box("status", "status_ordem")
        else:
            codes = []
            for ln in lines:
                codes += SAP_STATUS_RE.findall(ln.text)
            if codes:
                o.status_ordem = " ".join(dict.fromkeys(codes))
        if val("prioridade"):
            o.prioridade_sap = val("prioridade")[:40]
        if val("tipo_ordem"):
            o.tipo_ordem_sap = val("tipo_ordem")[:120]

        d_raw = val("data_abertura") or val("data_inicio")
        t_raw = val("creation_time") or val("hora_inicio")
        o.data_abertura = parse_date(d_raw)
        o.hora_abertura = parse_time(t_raw)
        if o.data_abertura and o.hora_abertura is None and d_raw:
            o.hora_abertura = parse_time(d_raw[10:])
        box("data_abertura" if "data_abertura" in by_key else "data_inicio", "data_abertura")
        box("creation_time" if "creation_time" in by_key else "hora_inicio", "data_abertura")

        if val("turno"):
            o.turno = normalize_turno(val("turno"))
            box("turno", "turno")

        rp = val("reportado_por") or (val("centro_trabalho") if self.tipo == TIPO_PREV_TEMPO or not val("reportado_por") else None)
        if rp:
            mm = re.match(r"^([A-Z]{3,}[A-Z0-9]*\d{2})\b\s*[-–]?\s*(.*)$", rp)
            if mm:
                o.reportado_por_id, rest = mm.group(1), clean_spaces(mm.group(2))
                o.reportado_por_nome = rest or None
            else:
                o.reportado_por_id = rp[:60]
            box("reportado_por" if "reportado_por" in by_key else "centro_trabalho", "reportado_por")
        if val("reportado_por_pessoa"):
            o.reportado_por_nome = val("reportado_por_pessoa")[:120]
            box("reportado_por_pessoa", "reportado_por")

        if val("grupo_planejamento"):
            o.grupo_planejamento = normalize_planning_group(val("grupo_planejamento"))
            box("grupo_planejamento", "grupo_planejamento")

        if "equipamento" in by_key:
            self._parse_equipamento(by_key["equipamento"])

        for key in ("defeito", "causa", "parte_objeto", "observacao", "inicio_avaria", "fim_avaria",
                    "duracao_avaria", "duracao_pane", "pane"):
            if key in by_key:
                self._apply_generic(by_key[key])

        self._parse_functional_location(lines, hits)

    def _parse_marker_tail(self, after: str) -> None:
        o = self.o
        if not after:
            return
        mp = re.search(r"\b(Imediat[oa]|Geral|Alta|M[ée]dia|Baixa|Urgente|Programad[oa])\b", after, re.I)
        if mp and not o.prioridade_sap:
            o.prioridade_sap = mp.group(1).capitalize()
        ms = re.search(r"Servi[çc]os\s+auxiliares\s+e\s+administrativos", after, re.I)
        if ms:
            o.tipo_ordem_sap = ms.group(0)

    def _parse_equipamento(self, h: LabelHit) -> None:
        v = h.value
        if not v or NEGATIVE_VALUE_RE.match(v):
            return
        mm = re.match(r"^(\d{5,18}|[A-Z0-9-]{4,30}\d)\b\s*[-–]?\s*(.*)$", v)
        if mm:
            self.o.equipamento_codigo = mm.group(1)
            self.o.equipamento_descricao = clean_spaces(mm.group(2)) or None
        else:
            self.o.equipamento_descricao = v[:200]
        self.add_box("equipamento", h.line, h.lstart, h.vend)

    def _parse_functional_location(self, header: list[LineToken], hits: list[LabelHit]) -> None:
        """Isolate the region between opening metadata and Equipamento/sections; find BT-ST code
        and concatenate everything else as the description (handles two-column inversions)."""
        o = self.o
        code_idx = None
        code_match = None
        for k, ln in enumerate(header):
            mm = FL_CODE_RE.search(ln.text)
            if mm:
                code_idx, code_match = k, mm
                break
        if code_idx is None:
            return
        code_line = header[code_idx]
        o.posicao_funcional = normalize_functional_location(code_match.group(1))
        o.arvore_planta = arvore_from_fl(o.posicao_funcional)
        self.add_box("posicao_funcional", code_line, code_match.start(1), code_match.end(1))

        meta_line_ids = {id(h.line) for h in hits if h.key in HEADER_META_LABELS}
        start = code_idx
        for k in range(code_idx - 1, max(self.marker_rel, code_idx - 3), -1):
            ln = header[k]
            if id(ln) in meta_line_ids and not self._residual_text(ln, hits).strip():
                break
            if LEAD_NUMBER_RE.match(ln.text) or _find_marker(ln.text):
                break
            start = k
        end = len(header)
        for k in range(code_idx + 1, len(header)):
            if any(h.line is header[k] and h.key in ("equipamento",) for h in hits):
                end = k
                break
            if k - code_idx > 6:
                end = k
                break
        pieces: list[str] = []
        desc_lines: list[LineToken] = []
        for k in range(start, end):
            ln = header[k]
            res = self._residual_text(ln, hits)
            if k == code_idx:
                res = res.replace(code_match.group(1), " ")
            res = FL_CODE_RE.sub(" ", res)
            res = clean_spaces(res.strip(" -–|:"))
            if res and not re.fullmatch(r"[\d\s./:-]+", res):
                pieces.append(res)
                desc_lines.append(ln)
        if pieces:
            o.descricao_posicao_funcional = clean_spaces(" ".join(pieces))[:1000]
            for ln in desc_lines:
                self.add_box("descricao_posicao_funcional", ln)

    def _residual_text(self, ln: LineToken, hits: list[LabelHit]) -> str:
        """Line text without any label+value region (except posição funcional label itself)."""
        text = list(ln.text)
        for h in hits:
            if h.line is not ln:
                continue
            if h.key == "posicao_funcional":
                for i in range(h.lstart, h.vstart):
                    text[i] = " "
                continue
            for i in range(h.lstart, h.vend):
                text[i] = " "
        s = "".join(text)
        s = LEAD_NUMBER_RE.sub(" ", s)
        fm = _find_marker(s)
        if fm:
            s = s[: fm[1].start()] + " " * (fm[1].end() - fm[1].start()) + s[fm[1].end():]
        return s

    # -- generic labels found anywhere --
    def _apply_generic(self, h: LabelHit) -> None:
        o = self.o
        v = h.value
        if h.key == "defeito" and v and not o.defeito:
            o.defeito = v[:300]
            self.add_box("defeito", h.line, h.lstart, h.vend)
        elif h.key == "causa" and v and not o.causa:
            o.causa = v[:300]
            self.add_box("causa", h.line, h.lstart, h.vend)
        elif h.key == "parte_objeto" and v:
            o.observacoes_objeto = clean_spaces(f"{o.observacoes_objeto or ''} Parte: {v}")
            self.add_box("objetos", h.line, h.lstart, h.vend)
        elif h.key == "observacao" and v:
            o.observacoes_objeto = clean_spaces(f"{o.observacoes_objeto or ''} {v}")
            self.add_box("objetos", h.line, h.lstart, h.vend)
        elif h.key == "inicio_avaria":
            o.inicio_avaria = parse_datetime(v) or o.inicio_avaria
            self.add_box("avaria", h.line, h.lstart, h.vend)
        elif h.key == "fim_avaria":
            o.fim_avaria = parse_datetime(v) or o.fim_avaria
            self.add_box("avaria", h.line, h.lstart, h.vend)
        elif h.key == "duracao_avaria":
            mins = parse_minutes(v)
            if mins is not None:
                o.duracao_avaria_min = mins
            self.add_box("avaria", h.line, h.lstart, h.vend)
        elif h.key == "duracao_pane":
            mins = parse_minutes(v)
            if mins:
                o.duracao_pane_min = mins
                o.teve_pane = True
            self.add_box("pane", h.line, h.lstart, h.vend)
        elif h.key == "pane":
            if POSITIVE_FLAG_RE.match(v or ""):
                o.teve_pane = True
            elif v and not NEGATIVE_VALUE_RE.match(v):
                mins = parse_minutes(v)
                if mins:
                    o.teve_pane, o.duracao_pane_min = True, mins
            self.add_box("pane", h.line, h.lstart, h.vend)

    def parse_generic_labels(self, body: list[LineToken]) -> None:
        for ln in body:
            for h in scan_labels(ln, ["defeito", "causa", "parte_objeto", "observacao", "inicio_avaria",
                                      "fim_avaria", "duracao_avaria", "duracao_pane", "pane"]):
                self._apply_generic(h)

    # -- sections --
    def parse_long_text(self, attr: str, head: LineToken, body: list[LineToken]) -> None:
        sx = SECTIONS[0][1] if attr == "descricao_longa_notificacao" else SECTIONS[1][1]
        first = sx.sub("", head.text).strip()
        parts = [first] if first else []
        parts += [ln.text.strip() for ln in body]
        txt = "\n".join(p for p in parts if p)
        if txt:
            prev = getattr(self.o, attr)
            setattr(self.o, attr, (prev + "\n" + txt) if prev else txt)
        key = "descricao_longa_notificacao" if attr == "descricao_longa_notificacao" else "descricao_longa_ordem"
        self.add_lines(key, [head] + body)

    def parse_objetos(self, head: LineToken, body: list[LineToken]) -> None:
        o = self.o
        self.add_lines("objetos", [head] + body)
        obs: list[str] = []
        for ln in body:
            hits = scan_labels(ln, ["defeito", "causa", "parte_objeto", "observacao", "equipamento",
                                    "inicio_avaria", "fim_avaria", "duracao_avaria", "duracao_pane", "pane"])
            if hits:
                for h in hits:
                    if h.key == "equipamento":
                        if not o.equipamento_codigo:
                            self._parse_equipamento(h)
                    else:
                        self._apply_generic(h)
                continue
            mm = re.match(r"^\s*(\d{1,4})\s+(.*)$", ln.text)
            if mm and len(o.objetos) < 20:
                rest = mm.group(2)
                fl = FL_CODE_RE.search(rest)
                fl_code = normalize_functional_location(fl.group(1)) if fl else None
                if fl:
                    rest = rest[: fl.start()] + rest[fl.end():]
                cols = [clean_spaces(c) for c in re.split(r"\s{2,}", rest) if clean_spaces(c)]
                equip = None
                for c in list(cols):
                    if re.fullmatch(r"\d{6,18}", c):
                        equip = c
                        cols.remove(c)
                        break
                descricao = cols[0] if cols else None
                description = " ".join(cols[1:]) or None
                o.objetos.append({"ordem": mm.group(1), "posicao_funcional": fl_code, "descricao": descricao,
                                  "equipamento": equip, "description": description})
                if not o.descricao_curta_objeto and (descricao or description):
                    o.descricao_curta_objeto = (descricao or description or "")[:300]
                if not o.posicao_funcional and fl_code:
                    o.posicao_funcional, o.arvore_planta = fl_code, arvore_from_fl(fl_code)
                    self.add_box("posicao_funcional", ln, *(fl.span(1)))
            else:
                t = clean_spaces(ln.text)
                if t:
                    obs.append(t)
        if obs:
            o.observacoes_objeto = clean_spaces(f"{o.observacoes_objeto or ''} " + " ".join(obs))[:4000]

    def parse_operations(self, head: LineToken, body: list[LineToken]) -> None:
        o = self.o
        lines = [head] + body
        self.add_lines("operacoes", lines)
        current: dict[str, str] | None = None
        for ln in lines:
            mm = OPERATION_ROW_RE.match(ln.text)
            if mm and not re.fullmatch(r"\s*Opera[çc](?:[ãa]o|[õo]es)\s*:?\s*", ln.text, re.I):
                current = {"numero": mm.group(1), "descricao": clean_spaces(mm.group(2))}
                o.operacoes.append(current)
            elif current is not None:
                t = clean_spaces(ln.text)
                if t:
                    current["descricao"] = clean_spaces(current["descricao"] + " " + t)[:2000]

    def parse_jump(self, head: LineToken, body: list[LineToken]) -> None:
        o = self.o
        mm = JUMP_RE.search(head.text)
        value = clean_spaces(head.text[mm.end():] if mm else "")
        value = re.sub(r"^\d{1,4}\s+", "", value)
        cont: list[str] = []
        used = [head]
        for ln in body:
            if scan_labels(ln, ["defeito", "causa", "inicio_avaria", "fim_avaria", "pane", "duracao_pane"]):
                self.parse_generic_labels([ln])
                break
            t = clean_spaces(ln.text)
            if t:
                cont.append(t)
                used.append(ln)
        detail = clean_spaces(" ".join([value] + cont))
        if value and NEGATIVE_VALUE_RE.match(value) and not cont:
            return
        o.tem_jump_force = True
        o.jump_origem = "LABEL"
        o.detalhe_jump_tarefas = detail or "By-pass ou Jump Anormais registrado na nota"
        self.add_lines("jump_tarefas", used)

    def parse_avaria(self, lines: list[LineToken]) -> None:
        for ln in lines:
            hits = scan_labels(ln)
            for h in hits:
                if h.key in ("inicio_avaria", "fim_avaria", "duracao_avaria", "duracao_pane", "pane", "defeito", "causa"):
                    self._apply_generic(h)

    def parse_confirmations(self, head: LineToken, body: list[LineToken]) -> None:
        o = self.o
        rows_lines: list[LineToken] = [head]
        text_lines: list[LineToken] = []
        tail_text = clean_spaces(SECTIONS[5][1].sub("", head.text))
        for ln in body:
            t = ln.text
            dm = re.search(DATE_RE, t)
            mm = CONFIRM_ROW_RE.search(t)
            if dm and mm:
                c = self._parse_confirmation_row(t)
                if c:
                    o.confirmations.append(c)
                    rows_lines.append(ln)
                    continue
            if CONFIRM_HEADER_RE.search(t) and not o.confirmations:
                rows_lines.append(ln)
                continue
            if clean_spaces(t):
                text_lines.append(ln)
        if tail_text and not CONFIRM_HEADER_RE.search(tail_text):
            text_lines.insert(0, head)
        self.add_lines("confirmacoes", rows_lines)
        if text_lines:
            txt = "\n".join(clean_spaces(SECTIONS[5][1].sub("", ln.text)) for ln in text_lines)
            o.texto_confirmacao = ((o.texto_confirmacao + "\n") if o.texto_confirmacao else "") + txt.strip()
            self.add_lines("texto_confirmacao", text_lines)
            self.parse_generic_labels(text_lines)

    @staticmethod
    def _parse_confirmation_row(t: str) -> ParsedConfirmation | None:
        dm = re.search(DATE_RE, t)
        dur = list(CONFIRM_ROW_RE.finditer(t))[-1]
        rest = t[: dur.start()] + " " + t[dur.end():]
        rest = rest.replace(dm.group(1), " ", 1) if dm else rest
        tm = re.search(TIME_RE, rest)
        if tm:
            rest = rest[: tm.start()] + " " + rest[tm.end():]
        centro = None
        cm = re.search(r"\b(TURNO\s+[A-ZÇÃ]+\.?\s+[A-ZÇÃ]+|STG[A-Z0-9]+|[A-Z]{2,}\s+(?:ELET|MEC)\w*\s+\w+)\b", rest)
        if cm:
            centro = clean_spaces(cm.group(1))
            rest = rest[: cm.start()] + " " + rest[cm.end():]
        mat = re.search(r"\b(\d{3,10})\b", rest)
        matricula = None
        if mat:
            matricula = mat.group(1)
            rest = rest[: mat.start()] + " " + rest[mat.end():]
        nome = clean_spaces(re.sub(r"[|;]", " ", rest)).strip(" -–") or None
        try:
            minutes = int(round(float(dur.group(1).replace(",", "."))))
        except ValueError:
            return None
        return ParsedConfirmation(
            data_execucao=parse_date(dm.group(1)) if dm else None,
            hora_execucao=parse_time(tm.group(1)) if tm else None,
            centro_trabalho=centro, matricula=matricula, nome_executante=nome, duracao_min=minutes)

    # -- finalisation --
    def finalize(self) -> None:
        o = self.o
        if self.tipo == TIPO_PREV_TEMPO:
            o.numero_nota = None
            self.boxes.pop("numero_nota", None)
        # avaria duration
        if o.inicio_avaria and o.fim_avaria and o.fim_avaria >= o.inicio_avaria and o.duracao_avaria_min is None:
            o.duracao_avaria_min = round((o.fim_avaria - o.inicio_avaria).total_seconds() / 60, 1)
        # pane heuristics
        if not o.teve_pane:
            m = PANE_TITLE_RE.search(o.titulo or "")
            if m and not _negated(o.titulo, m.start()):
                o.teve_pane = True
        if o.teve_pane and not o.duracao_pane_min and o.duracao_avaria_min:
            o.duracao_pane_min = o.duracao_avaria_min
        # jump keyword fallback
        if not o.tem_jump_force:
            for attr in ("titulo", "descricao_longa_notificacao", "texto_confirmacao"):
                txt = getattr(o, attr) or ""
                for m in JUMP_KEYWORD_RE.finditer(txt):
                    if not _negated(txt, m.start()):
                        o.tem_jump_force = True
                        o.jump_origem = "KEYWORD"
                        s = max(0, txt.rfind("\n", 0, m.start()) + 1)
                        e = txt.find("\n", m.end())
                        o.detalhe_jump_tarefas = clean_spaces(txt[s: e if e > 0 else len(txt)])[:1000]
                        break
                if o.tem_jump_force:
                    break
        # HH
        o.hh_total_minutos = int(sum(c.duracao_min for c in o.confirmations))
        people = {(c.matricula or c.nome_executante or "?") for c in o.confirmations}
        o.quantidade_executantes = len(people) if o.confirmations else 0
        o.especialidade = infer_specialty(
            o.reportado_por_id, o.reportado_por_nome if self.tipo == TIPO_PREV_TEMPO else None,
            o.grupo_planejamento, [c.centro_trabalho or "" for c in o.confirmations], self.rules)
        # bboxes
        o.field_bboxes = {k: _merge_locs(v) for k, v in self.boxes.items()}
        o.field_bboxes["record"] = _line_locs(self.lines)
        o.start_page = self.lines[0].page
        o.end_page = self.lines[-1].page
        if not o.numero_ordem:
            o.warnings.append("Ordem não encontrada")
        if self.tipo != TIPO_PREV_TEMPO and not o.numero_nota:
            o.warnings.append("Nota não encontrada")
        if not o.posicao_funcional:
            o.warnings.append("Posição funcional não encontrada")
        if not o.data_abertura:
            o.warnings.append("Data de abertura não encontrada")


# --------------------------------------------------------------------------------------------
# OCR
# --------------------------------------------------------------------------------------------
def text_chars_per_page(doc: fitz.Document) -> list[int]:
    return [len(doc[i].get_text("text").strip()) for i in range(doc.page_count)]


def needs_ocr(doc: fitz.Document, min_chars_per_page: int = 40) -> bool:
    counts = text_chars_per_page(doc)
    if not counts:
        return False
    poor = sum(1 for c in counts if c < min_chars_per_page)
    return poor >= max(1, len(counts) // 2)


class OcrUnavailable(RuntimeError):
    pass


def run_ocr(src: Path, dst: Path, timeout: int = 900) -> None:
    """Run OCRmyPDF without a shell. Arguments are a fixed list; paths are passed as argv items."""
    exe = shutil.which("ocrmypdf")
    if not exe:
        raise OcrUnavailable("ocrmypdf não está instalado no servidor")
    cmd = [exe, "--skip-text", "--rotate-pages", "--deskew", "-l", "por+eng", "--output-type", "pdf",
           "--optimize", "1", "--jobs", "2", "--", str(src), str(dst)]
    proc = subprocess.run(cmd, shell=False, capture_output=True, timeout=timeout, check=False)  # noqa: S603
    if proc.returncode not in (0, 6):  # 6 = already has text (with --skip-text it's fine)
        raise RuntimeError(f"OCRmyPDF falhou (código {proc.returncode}): {proc.stderr.decode(errors='ignore')[-400:]}")


def ensure_text_layer(src: Path, ocr_out: Path, enabled: bool = True, min_chars_per_page: int = 40) -> tuple[Path, bool, list[str]]:
    """Return (viewable_pdf_path, ocr_applied, warnings)."""
    warnings: list[str] = []
    with fitz.open(src) as doc:
        if not needs_ocr(doc, min_chars_per_page):
            return src, False, warnings
    if not enabled:
        warnings.append("PDF sem camada de texto e OCR desativado nas preferências")
        return src, False, warnings
    try:
        run_ocr(src, ocr_out)
        return ocr_out, True, warnings
    except Exception as exc:  # OCR failure must never break ingestion
        log.warning("OCR failed: %s", exc)
        warnings.append(f"OCR não aplicado: {exc}")
        return src, False, warnings


# --------------------------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------------------------
def extract_from_document(doc: fitz.Document, specialty_rules: dict[str, list[str]] | None = None) -> ExtractionResult:
    pages, sizes = extract_line_tokens(doc)
    stream, info = clean_and_stitch(pages, sizes)
    segments = segment_records(stream)
    occurrences: list[ParsedOccurrence] = []
    warnings: list[str] = []
    for tipo, s, mi, e in segments:
        lines = stream[s:e]
        try:
            occ = RecordParser(tipo, lines, mi - s, specialty_rules).parse()
        except Exception as exc:  # isolate a bad record, never lose the whole report
            log.exception("record parse failed at page %s", stream[s].page)
            warnings.append(f"Falha ao interpretar registro na pág. {stream[s].page}: {exc}")
            continue
        if not occ.unique_sap_key:
            warnings.append(f"Registro sem Nota/Ordem ignorado na pág. {occ.start_page}: {occ.titulo[:60]}")
            continue
        occurrences.append(occ)
    if segments and segments[0][1] > 0:
        pre = [ln.text for ln in stream[: segments[0][1]] if ORDER_RE.search(ln.text) or NOTE_RE.search(ln.text)]
        if pre:
            warnings.append(f"{len(pre)} linha(s) com números SAP antes do primeiro registro reconhecido")
    if not segments:
        warnings.append("Nenhum registro SAP PM reconhecido no documento")
    return ExtractionResult(
        occurrences=occurrences, page_count=doc.page_count, page_sizes=sizes,
        report_period_start=info.period_start, report_period_end=info.period_end,
        emitted_at=info.emitted_at, report_title=info.report_title, warnings=warnings, lines=stream)


def extract_pdf(path: str | Path, specialty_rules: dict[str, list[str]] | None = None) -> ExtractionResult:
    with fitz.open(path) as doc:
        return extract_from_document(doc, specialty_rules)


def _json_default(o: Any) -> Any:
    if isinstance(o, (datetime, date, time)):
        return o.isoformat()
    raise TypeError(type(o))


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="ATC Vision SAP PM extractor (calibration CLI)")
    ap.add_argument("pdf")
    ap.add_argument("--dump-lines", action="store_true", help="print the cleaned stitched line stream")
    ap.add_argument("--json", action="store_true", help="print parsed occurrences as JSON")
    args = ap.parse_args(argv)
    res = extract_pdf(args.pdf)
    if args.dump_lines:
        for ln in res.lines:
            print(f"[p{ln.page:02d} y{ln.bbox[1]:6.1f}] {ln.text}")
    if args.json:
        payload = {
            "period": [res.report_period_start, res.report_period_end], "emitted_at": res.emitted_at,
            "pages": res.page_count, "warnings": res.warnings,
            "occurrences": [o.to_dict() for o in res.occurrences],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default))
    else:
        print(f"{len(res.occurrences)} ocorrências | período {res.report_period_start} → {res.report_period_end}")
        for o in res.occurrences:
            print(f"  {TIPO_LABELS[o.tipo_ocorrencia]:<26} nota={o.numero_nota} ordem={o.numero_ordem} "
                  f"pf={o.posicao_funcional} pane={o.teve_pane} jump={o.tem_jump_force} pág={o.start_page}-{o.end_page} | {o.titulo[:50]}")
        for w in res.warnings:
            print("  ! " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
