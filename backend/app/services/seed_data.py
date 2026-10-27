from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import FilterPreset, ReportTemplate, SystemSetting, User

log = logging.getLogger("atc.seed")

DEFAULT_PRESETS = [
    {
        "name": "⚡ Meu Foco: Refino Secundário (Elét)",
        "icon": "Zap",
        "color": "#3b82f6",
        "is_default": True,
        "show_in_quickbar": True,
        "sort_order": 1,
        "filter_payload": {
            "functional_locations_prefixes": ["BT-ST-SLM1"],
            "specialties": ["ELETRICA"],
            "planning_groups": ["058/AT00"],
            "only_pane": False,
            "only_jump": False,
            "only_relevant": False,
            "only_analyze": False,
        },
    },
    {
        "name": "🔥 Refino Secundário (Geral)",
        "icon": "Flame",
        "color": "#f97316",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 2,
        "filter_payload": {
            "functional_locations_prefixes": ["BT-ST-SLM1"],
            "only_pane": False,
            "only_jump": False,
            "only_relevant": False,
            "only_analyze": False,
        },
    },
    {
        "name": "⚠️ Jumps / Forces Ativos",
        "icon": "AlertTriangle",
        "color": "#eab308",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 3,
        "filter_payload": {
            "only_jump": True,
        },
    },
    {
        "name": "🛑 Panes Operacionais",
        "icon": "OctagonAlert",
        "color": "#ef4444",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 4,
        "filter_payload": {
            "only_pane": True,
        },
    },
    {
        "name": "🔍 Marcados p/ Analisar",
        "icon": "Search",
        "color": "#8b5cf6",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 5,
        "filter_payload": {
            "only_analyze": True,
        },
    },
    {
        "name": "⭐ Ocorrências Relevantes",
        "icon": "Star",
        "color": "#10b981",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 6,
        "filter_payload": {
            "only_relevant": True,
        },
    },
]

DEFAULT_TEMPLATES = [
    {
        "name": "Relatório Diário de Turno",
        "description": "Template enxuto para reunião matinal de alinhamento com a operação",
        "selected_fields": ["nota_ordem", "posicao_funcional", "titulo_resumo", "pane", "jump", "comentarios_atc"],
        "grouping_field": "arvore_planta",
        "include_atc_comments": True,
        "header_title": "ATC Vision — Relatório Diário de Confiabilidade",
        "export_format_default": "pdf",
    },
    {
        "name": "Relatório Executivo de Panes e Falhas",
        "description": "Foco exclusivo em indisponibilidade, causas e impacto operacional",
        "selected_fields": ["posicao_funcional", "titulo_resumo", "pane", "defeito_causa", "comentarios_atc", "executantes_hh"],
        "grouping_field": "arvore_planta",
        "include_atc_comments": True,
        "header_title": "ATC Vision — Relatório Executivo de Panes",
        "export_format_default": "pdf",
    },
    {
        "name": "Monitor de Risco: Jumps e By-passes",
        "description": "Acompanhamento rigoroso de modificações provisórias e forces ativos",
        "selected_fields": ["nota_ordem", "posicao_funcional", "titulo_resumo", "jump", "status_atc", "comentarios_atc"],
        "grouping_field": "arvore_planta",
        "include_atc_comments": True,
        "header_title": "ATC Vision — Gestão de Mudanças e Jumps Ativos",
        "export_format_default": "whatsapp",
    },
]


async def seed_initial_data(db: AsyncSession) -> None:
    # 1. Admin User
    admin_res = await db.execute(select(User).where(User.email == settings.ADMIN_EMAIL))
    admin = admin_res.scalar_one_or_none()
    if not admin:
        log.info("Creating default admin user: %s", settings.ADMIN_EMAIL)
        new_admin = User(
            email=settings.ADMIN_EMAIL,
            name=settings.ADMIN_NAME,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            is_admin=True,
        )
        db.add(new_admin)
    else:
        # Atualiza a senha caso tenha sido redefinida na instalação/variáveis de ambiente
        admin.hashed_password = hash_password(settings.ADMIN_PASSWORD)
        admin.is_admin = True
        db.add(admin)

    # 2. Presets
    preset_count_res = await db.execute(select(FilterPreset))
    if not preset_count_res.scalars().first():
        log.info("Seeding default filter presets for Aciaria / Refino Secundário")
        for p in DEFAULT_PRESETS:
            db.add(FilterPreset(**p))

    # 3. Report Templates
    template_count_res = await db.execute(select(ReportTemplate))
    if not template_count_res.scalars().first():
        log.info("Seeding default report templates")
        for t in DEFAULT_TEMPLATES:
            db.add(ReportTemplate(**t))

    # 4. System Settings
    setting_res = await db.execute(select(SystemSetting).where(SystemSetting.key == "general"))
    if not setting_res.scalar_one_or_none():
        log.info("Seeding default system settings")
        db.add(
            SystemSetting(
                key="general",
                value={
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
                },
            )
        )

    await db.commit()
