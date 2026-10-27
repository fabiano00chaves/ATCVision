from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    daily,
    dashboards,
    documents,
    ingest,
    meta,
    occurrences,
    presets,
    reports,
    settings,
    tokens_webhooks,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Autenticação"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documentos"])
api_router.include_router(occurrences.router, prefix="/occurrences", tags=["Ocorrências"])
api_router.include_router(occurrences.comment_router, prefix="/comments", tags=["Comentários"])
api_router.include_router(daily.router, prefix="/daily", tags=["Relatório Diário"])
api_router.include_router(presets.router, prefix="/presets", tags=["Filtros Pré-Cadastrados"])
api_router.include_router(dashboards.router, prefix="/dashboards", tags=["Dashboards e Confiabilidade"])
api_router.include_router(reports.router, tags=["Relatórios"])
api_router.include_router(settings.router, prefix="/settings", tags=["Configurações"])
api_router.include_router(meta.router, prefix="/meta", tags=["Metadados e Facetas"])
api_router.include_router(tokens_webhooks.router, tags=["Tokens e Webhooks"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["Ingestão Automatizada"])
