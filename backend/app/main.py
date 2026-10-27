from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import async_session_factory, engine, Base
from app.services.seed_data import seed_initial_data
from app.services.watch_folder import start_watch_folder_background, stop_watch_folder_background

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("atc.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s v%s", settings.PROJECT_NAME, settings.PROJECT_VERSION)
    
    # 1. Enable PostgreSQL extensions in autocommit mode so failed attempts never abort subsequent transactions
    if not settings.DATABASE_URL.startswith("sqlite"):
        try:
            async with engine.connect() as ext_conn:
                await ext_conn.execution_options(isolation_level="AUTOCOMMIT")
                try:
                    await ext_conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
                except Exception as ext_err:
                    log.warning("pg_trgm extension notice: %s", ext_err)
                try:
                    await ext_conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent;"))
                except Exception as ext_err:
                    log.warning("unaccent extension notice: %s", ext_err)
        except Exception as e:
            log.warning("Could not probe postgres extensions: %s", e)

    # 2. Ensure tables exist in clean transaction
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        log.error("Error creating tables in lifespan: %s", e)

    # 3. Seed initial data (Admin, default Presets, default Report Templates, Settings)
    try:
        async with async_session_factory() as db:
            await seed_initial_data(db)
    except Exception as e:
        log.warning("Error running seed data: %s", e)

    # 4. Start watch folder monitoring in background
    try:
        start_watch_folder_background()
    except Exception as e:
        log.warning("Error starting watch folder background task: %s", e)

    yield

    log.info("Shutting down %s", settings.PROJECT_NAME)
    try:
        stop_watch_folder_background()
    except Exception:
        pass
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="Sistema de Inteligência, Auditoria Visual Lado a Lado e Gestão de Confiabilidade para Relatórios SAP PM",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Main API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
async def health_check():
    db_ok = False
    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
            db_ok = True
    except Exception as exc:
        log.warning("Health check DB probe failed: %s", exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "version": settings.PROJECT_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/", include_in_schema=False)
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.PROJECT_VERSION,
        "docs": f"{settings.API_V1_STR}/docs",
    }
