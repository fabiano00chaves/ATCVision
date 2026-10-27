from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Dict, List, Optional

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.db.models import Occurrence

FIELD_DEFINITIONS = [
    {"key": "nota_ordem", "label": "Nota / Ordem", "default": True},
    {"key": "posicao_funcional", "label": "Posição Funcional + Descrição Curta", "default": True},
    {"key": "arvore_completa", "label": "Árvore Completa da Posição Funcional", "default": False},
    {"key": "titulo_resumo", "label": "Título e Resumo da Intervenção", "default": True},
    {"key": "pane", "label": "Status de Pane / Duração", "default": True},
    {"key": "jump", "label": "Alerta de By-pass / Jump", "default": True},
    {"key": "comentarios_atc", "label": "Comentários e Parecer Técnico do ATC", "default": True},
    {"key": "executantes_hh", "label": "Lista de Executantes / HH", "default": False},
    {"key": "defeito_causa", "label": "Defeito e Causa", "default": False},
    {"key": "status_atc", "label": "Status ATC", "default": False},
    {"key": "turno_abertura", "label": "Turno e Data/Hora Abertura", "default": False},
    {"key": "tipo", "label": "Tipo de Ocorrência", "default": False},
]


def format_cell_value(occ: Occurrence, field_key: str, include_comments: bool = True) -> str:
    if field_key == "nota_ordem":
        nota = occ.numero_nota or "-"
        ordem = occ.numero_ordem or "-"
        return f"Nota: {nota}\nOrdem: {ordem}"
    elif field_key == "posicao_funcional":
        pf = occ.posicao_funcional or "-"
        desc = occ.descricao_curta_objeto or occ.descricao_posicao_funcional or ""
        return f"{pf}\n{desc[:80]}" if desc else pf
    elif field_key == "arvore_completa":
        return occ.posicao_funcional or "-"
    elif field_key == "titulo_resumo":
        return occ.titulo or "-"
    elif field_key == "pane":
        if occ.teve_pane:
            return f"SIM ({int(occ.duracao_pane_min)} min)"
        return "NÃO"
    elif field_key == "jump":
        if occ.tem_jump_force:
            status = occ.jump_status or "ATIVO"
            detail = occ.detalhe_jump_tarefas or ""
            return f"SIM [{status}]\n{detail[:60]}"
        return "NÃO"
    elif field_key == "comentarios_atc":
        if not include_comments or not occ.comments:
            return "-"
        return "\n".join(f"• {c.author_name}: {c.comment_text}" for c in occ.comments[:3])
    elif field_key == "executantes_hh":
        hh = f"{occ.hh_total_minutos} min"
        execs = [c.nome_executante for c in occ.confirmations if c.nome_executante]
        if execs:
            return f"{hh}\n({', '.join(set(execs)[:3])})"
        return hh
    elif field_key == "defeito_causa":
        d = occ.defeito or "-"
        c = occ.causa or "-"
        return f"Def: {d}\nCausa: {c}"
    elif field_key == "status_atc":
        prio = f" [{occ.prioridade_atc}]" if occ.prioridade_atc else ""
        return f"{occ.status_atc}{prio}"
    elif field_key == "turno_abertura":
        t = occ.turno or "-"
        dt = occ.abertura_timestamp.strftime("%d/%m/%Y %H:%M") if occ.abertura_timestamp else "-"
        return f"{t}\n{dt}"
    elif field_key == "tipo":
        return occ.tipo_ocorrencia.replace("_", " ")
    return "-"


def generate_pdf_report(
    occurrences: List[Occurrence],
    selected_fields: List[str],
    header_title: str = "ATC Vision — Relatório de Confiabilidade",
    include_atc_comments: bool = True,
    grouping_field: str = "arvore_planta",
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=24,
        rightMargin=24,
        topMargin=24,
        bottomMargin=24,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0f172a"),
    )
    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748b"),
    )
    cell_style = ParagraphStyle(
        "ReportCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1e293b"),
    )
    cell_bold_style = ParagraphStyle(
        "ReportCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
    )

    story = []

    # Header
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    story.append(Paragraph(header_title, title_style))
    story.append(
        Paragraph(
            f"Gerado em: {now_str} | Total de Ocorrências: {len(occurrences)} | Domínio: vision.fk.adm.br",
            meta_style,
        )
    )
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#cbd5e1"), spaceAfter=10))

    # Field mapping
    fields = [f for f in FIELD_DEFINITIONS if f["key"] in selected_fields]
    if not fields:
        fields = [f for f in FIELD_DEFINITIONS if f["default"]]

    # Build Table
    headers = [Paragraph(f"<b>{f['label']}</b>", cell_bold_style) for f in fields]
    table_data = [headers]

    for occ in occurrences:
        row = []
        for f in fields:
            val = format_cell_value(occ, f["key"], include_comments=include_atc_comments)
            # Style special cells
            if f["key"] == "pane" and occ.teve_pane:
                p_text = f"<font color='#dc2626'><b>{val}</b></font>"
            elif f["key"] == "jump" and occ.tem_jump_force:
                p_text = f"<font color='#d97706'><b>{val}</b></font>"
            else:
                p_text = val.replace("\n", "<br/>")
            row.append(Paragraph(p_text, cell_style))
        table_data.append(row)

    col_count = len(fields)
    total_width = 842 - 48  # Landscape A4 minus margins = 794
    col_width = total_width / max(col_count, 1)

    t = Table(table_data, colWidths=[col_width] * col_count, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_excel_report(
    occurrences: List[Occurrence],
    selected_fields: List[str],
    header_title: str = "ATC Vision — Relatório de Confiabilidade",
    include_atc_comments: bool = True,
) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Ocorrências"

    fields = [f for f in FIELD_DEFINITIONS if f["key"] in selected_fields]
    if not fields:
        fields = [f for f in FIELD_DEFINITIONS if f["default"]]

    # Header title banner
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(fields))
    title_cell = ws.cell(row=1, column=1, value=f"{header_title} (Gerado: {datetime.now().strftime('%d/%m/%Y %H:%M')})")
    title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    # Column Headers
    header_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    for col_idx, f in enumerate(fields, 1):
        cell = ws.cell(row=2, column=col_idx, value=f["label"])
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[2].height = 24

    # Data Rows
    pane_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    jump_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

    for row_idx, occ in enumerate(occurrences, 3):
        for col_idx, f in enumerate(fields, 1):
            val = format_cell_value(occ, f["key"], include_comments=include_atc_comments)
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = Font(name="Calibri", size=9)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border = thin_border

            if f["key"] == "pane" and occ.teve_pane:
                cell.fill = pane_fill
                cell.font = Font(name="Calibri", size=9, bold=True, color="B91C1C")
            elif f["key"] == "jump" and occ.tem_jump_force:
                cell.fill = jump_fill
                cell.font = Font(name="Calibri", size=9, bold=True, color="B45309")

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        for cell in col:
            lines = str(cell.value or "").split("\n")
            for line in lines:
                max_len = max(max_len, len(line))
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 50)

    # Enable autofilter on header row
    ws.auto_filter.ref = f"A2:{openpyxl.utils.get_column_letter(len(fields))}{len(occurrences) + 2}"

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_csv_report(
    occurrences: List[Occurrence],
    selected_fields: List[str],
    include_atc_comments: bool = True,
) -> str:
    fields = [f for f in FIELD_DEFINITIONS if f["key"] in selected_fields]
    if not fields:
        fields = [f for f in FIELD_DEFINITIONS if f["default"]]

    output = io.StringIO()
    # Write UTF-8 BOM for automatic Excel delimiter and accent support
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)

    writer.writerow([f["label"] for f in fields])
    for occ in occurrences:
        row = [format_cell_value(occ, f["key"], include_comments=include_atc_comments).replace("\n", " | ") for f in fields]
        writer.writerow(row)

    return output.getvalue()


def generate_whatsapp_teams_report(
    occurrences: List[Occurrence],
    header_title: str = "ATC Vision — Relatório Diário de Turno",
    include_atc_comments: bool = True,
) -> str:
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    panes = [o for o in occurrences if o.teve_pane]
    jumps = [o for o in occurrences if o.tem_jump_force]
    relevantes = [o for o in occurrences if o.flag_relevante or o.flag_analisar]

    lines = [
        f"📊 *{header_title.upper()}*",
        f"🗓️ *Emissão:* {now_str} | *Total:* {len(occurrences)} ocorrências",
        "",
        f"🚨 *Panes Operacionais:* {len(panes)} ({int(sum(o.duracao_pane_min for o in panes))} min acumulados)",
        f"⚠️ *Jumps / Forces Ativos:* {len(jumps)}",
        f"⭐ *Ocorrências em Foco ATC:* {len(relevantes)}",
        "──────────────────────────────",
    ]

    # Detailed list for high priority items first, then others
    items_to_show = relevantes if relevantes else occurrences[:15]

    for idx, occ in enumerate(items_to_show, 1):
        pf = occ.posicao_funcional or "Área Geral"
        icons = []
        if occ.teve_pane:
            icons.append(f"🛑 PANE ({int(occ.duracao_pane_min)}m)")
        if occ.tem_jump_force:
            icons.append("⚠️ JUMP")
        if occ.flag_relevante:
            icons.append("⭐ RELEVANTE")
        if occ.flag_analisar:
            icons.append("🔍 ANALISAR")

        icon_header = f" [{ ' | '.join(icons) }]" if icons else ""

        lines.append(f"*{idx}. {pf}*{icon_header}")
        lines.append(f"   • *Ordem:* {occ.numero_ordem or '-'} | *Nota:* {occ.numero_nota or '-'}")
        lines.append(f"   • *Título:* {occ.titulo}")
        if occ.descricao_posicao_funcional:
            lines.append(f"   • *Local:* {occ.descricao_posicao_funcional[:90]}")
        if occ.defeito or occ.causa:
            lines.append(f"   • *Modo de Falha:* {occ.defeito or '-'} / Causa: {occ.causa or '-'}")
        if occ.tem_jump_force and occ.detalhe_jump_tarefas:
            lines.append(f"   • *Detalhe Jump:* {occ.detalhe_jump_tarefas[:120]}")
        if include_atc_comments and occ.comments:
            latest = occ.comments[0]
            lines.append(f"   • 💬 *ATC ({latest.author_name}):* {latest.comment_text}")
        lines.append("")

    lines.append("──────────────────────────────")
    lines.append("🔗 Acesse a auditoria visual completa: https://vision.fk.adm.br")
    return "\n".join(lines)
