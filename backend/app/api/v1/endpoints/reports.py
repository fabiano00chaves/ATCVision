from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.models import Occurrence, ReportTemplate, User
from app.db.session import get_db
from app.schemas.report import (
    GenerateReportRequest,
    ReportFieldOut,
    ReportTemplateCreate,
    ReportTemplateOut,
    ReportTemplateUpdate,
    TextReportResponse,
)
from app.services.occurrence_service import (
    apply_occurrence_filters,
    apply_occurrence_sorting,
)
from app.services.report_generator import (
    FIELD_DEFINITIONS,
    generate_csv_report,
    generate_excel_report,
    generate_pdf_report,
    generate_whatsapp_teams_report,
)

router = APIRouter()


@router.get("/report-fields", response_model=List[ReportFieldOut])
async def get_report_fields(current_user: User = Depends(get_current_user)):
    return [ReportFieldOut(**f) for f in FIELD_DEFINITIONS]


@router.get("/report-templates", response_model=List[ReportTemplateOut])
async def list_report_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(ReportTemplate).order_by(ReportTemplate.name.asc()))
    templates = res.scalars().all()
    return [ReportTemplateOut.model_validate(t) for t in templates]


@router.post("/report-templates", response_model=ReportTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_report_template(
    payload: ReportTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = ReportTemplate(
        name=payload.name.strip(),
        description=payload.description.strip(),
        selected_fields=payload.selected_fields,
        grouping_field=payload.grouping_field,
        include_atc_comments=payload.include_atc_comments,
        header_title=payload.header_title.strip(),
        export_format_default=payload.export_format_default,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return ReportTemplateOut.model_validate(template)


@router.put("/report-templates/{template_id}", response_model=ReportTemplateOut)
async def update_report_template(
    template_id: str,
    payload: ReportTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(ReportTemplate).where(ReportTemplate.id == template_id))
    template = res.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template de relatório não encontrado")

    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.description is not None:
        template.description = payload.description.strip()
    if payload.selected_fields is not None:
        template.selected_fields = payload.selected_fields
    if payload.grouping_field is not None:
        template.grouping_field = payload.grouping_field
    if payload.include_atc_comments is not None:
        template.include_atc_comments = payload.include_atc_comments
    if payload.header_title is not None:
        template.header_title = payload.header_title.strip()
    if payload.export_format_default is not None:
        template.export_format_default = payload.export_format_default

    await db.commit()
    await db.refresh(template)
    return ReportTemplateOut.model_validate(template)


@router.delete("/report-templates/{template_id}")
async def delete_report_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(ReportTemplate).where(ReportTemplate.id == template_id))
    template = res.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template de relatório não encontrado")

    await db.delete(template)
    await db.commit()
    return {"ok": True, "message": "Template de relatório excluído"}


@router.post("/reports/generate")
async def generate_report(
    req: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch template if provided
    selected_fields = req.selected_fields
    grouping = req.grouping_field or "arvore_planta"
    include_comments = req.include_atc_comments if req.include_atc_comments is not None else True
    header_title = req.header_title or "ATC Vision — Relatório de Confiabilidade"
    export_format = req.format.lower()

    if req.template_id:
        t_res = await db.execute(select(ReportTemplate).where(ReportTemplate.id == req.template_id))
        tmpl = t_res.scalar_one_or_none()
        if tmpl:
            selected_fields = selected_fields or tmpl.selected_fields
            grouping = tmpl.grouping_field or grouping
            include_comments = tmpl.include_atc_comments
            header_title = req.header_title or tmpl.header_title

    if not selected_fields:
        selected_fields = [f["key"] for f in FIELD_DEFINITIONS if f["default"]]

    # Fetch occurrences
    base_query = select(Occurrence).options(
        selectinload(Occurrence.confirmations),
        selectinload(Occurrence.comments),
        selectinload(Occurrence.mappings),
    )

    if req.occurrence_ids:
        query = base_query.where(Occurrence.id.in_(req.occurrence_ids))
    else:
        filters = dict(req.filters or {})
        # Scope filtering
        if req.scope == "relevant_or_analyze":
            filters["only_relevant"] = False
            filters["only_analyze"] = False
            # Will be filtered via query or-statement
            base_query = base_query.where((Occurrence.flag_relevante.is_(True)) | (Occurrence.flag_analisar.is_(True)))
        elif req.scope == "relevant":
            filters["only_relevant"] = True
        elif req.scope == "analyze":
            filters["only_analyze"] = True

        query = await apply_occurrence_filters(base_query, filters, db)

    query = apply_occurrence_sorting(query, "abertura_desc")
    res = await db.execute(query)
    occurrences = res.scalars().all()

    filename_prefix = "relatorio_atc_vision"

    if export_format == "pdf":
        pdf_bytes = generate_pdf_report(
            occurrences=occurrences,
            selected_fields=selected_fields,
            header_title=header_title,
            include_atc_comments=include_comments,
            grouping_field=grouping,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename_prefix}.pdf"'},
        )

    elif export_format == "xlsx":
        xlsx_bytes = generate_excel_report(
            occurrences=occurrences,
            selected_fields=selected_fields,
            header_title=header_title,
            include_atc_comments=include_comments,
        )
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename_prefix}.xlsx"'},
        )

    elif export_format == "csv":
        csv_text = generate_csv_report(
            occurrences=occurrences,
            selected_fields=selected_fields,
            include_atc_comments=include_comments,
        )
        return Response(
            content=csv_text.encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename_prefix}.csv"'},
        )

    elif export_format in ("whatsapp", "markdown"):
        text = generate_whatsapp_teams_report(
            occurrences=occurrences,
            header_title=header_title,
            include_atc_comments=include_comments,
        )
        return TextReportResponse(text=text, count=len(occurrences))

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato de exportação '{export_format}' não suportado. Utilize pdf, xlsx, csv, whatsapp ou markdown.",
        )
