from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.middleware import SecurityHeadersMiddleware
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

            # 2.1 Idempotent column migrations for existing databases (PostgreSQL & SQLite)
            is_sqlite = settings.DATABASE_URL.startswith("sqlite")
            if is_sqlite:
                col_res = await conn.execute(text("PRAGMA table_info(occurrences)"))
                existing_cols = {row[1] for row in col_res.fetchall()}
            else:
                col_res = await conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'occurrences'"
                    )
                )
                existing_cols = {row[0] for row in col_res.fetchall()}

            migrations = []
            if "flag_destaque_reuniao" not in existing_cols:
                migrations.append(
                    "ALTER TABLE occurrences ADD COLUMN flag_destaque_reuniao BOOLEAN NOT NULL DEFAULT FALSE"
                )
            if "primeira_confirmacao_em" not in existing_cols:
                migrations.append(
                    "ALTER TABLE occurrences ADD COLUMN primeira_confirmacao_em TIMESTAMP NULL"
                )
            if "ultima_confirmacao_em" not in existing_cols:
                migrations.append(
                    "ALTER TABLE occurrences ADD COLUMN ultima_confirmacao_em TIMESTAMP NULL"
                )

            for ddl in migrations:
                await conn.execute(text(ddl))

            # Ensure new indexes exist safely
            index_ddls = [
                "CREATE INDEX IF NOT EXISTS ix_occurrences_flag_destaque_reuniao ON occurrences (flag_destaque_reuniao)",
                "CREATE INDEX IF NOT EXISTS ix_occurrences_ultima_confirmacao_em ON occurrences (ultima_confirmacao_em)",
                "CREATE INDEX IF NOT EXISTS idx_occurrences_confirmacao_esp ON occurrences (ultima_confirmacao_em, especialidade)",
                "CREATE INDEX IF NOT EXISTS idx_occurrences_reuniao_abertura ON occurrences (flag_destaque_reuniao, abertura_timestamp)",
            ]
            for idx_ddl in index_ddls:
                try:
                    await conn.execute(text(idx_ddl))
                except Exception as idx_err:
                    log.debug("Index creation notice: %s", idx_err)
    except Exception as e:
        log.error("Error creating/migrating tables in lifespan: %s", e)

    # 2.5 Backfill confirmation bounds on legacy rows where missing
    try:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.db.models import Occurrence
        from app.services.occurrence_service import compute_confirmation_bounds

        async with async_session_factory() as db:
            res = await db.execute(
                select(Occurrence)
                .options(selectinload(Occurrence.confirmations))
                .where(Occurrence.ultima_confirmacao_em.is_(None))
            )
            candidates = res.scalars().all()
            updated = 0
            for occ in candidates:
                if occ.confirmations or occ.texto_confirmacao:
                    cmin, cmax = compute_confirmation_bounds(occ.confirmations, occ.texto_confirmacao)
                    if cmin or cmax:
                        occ.primeira_confirmacao_em = cmin
                        occ.ultima_confirmacao_em = cmax
                        updated += 1
            if updated > 0:
                await db.commit()
                log.info("Backfilled confirmation timestamps on %d historical occurrence(s).", updated)
    except Exception as e:
        log.warning("Notice during confirmation timestamp backfill: %s", e)

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

# Security Headers & Cloudflare Request Correlation Middleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    from starlette.exceptions import HTTPException as StarletteHTTPException
    if isinstance(exc, StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )

    log.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Erro interno no servidor. A operação foi cancelada por segurança."},
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
