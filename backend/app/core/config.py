from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "ATC Vision"
    PROJECT_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Environment
    ENVIRONMENT: str = "production"  # development | production | test
    DEBUG: bool = False

    # Security
    JWT_SECRET_KEY: str = Field(default="insecure-dev-key-change-in-production-openssl-rand-hex-32")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    COOKIE_NAME: str = "atc_session"
    COOKIE_SECURE: bool = False  # Set to True behind HTTPS in production
    COOKIE_SAMESITE: str = "lax"  # lax | strict | none

    # API Key for automation/webhooks
    MASTER_API_KEY: str = "atc-master-api-key-change-in-production"

    # Initial Admin Seed
    ADMIN_EMAIL: str = Field(
        default="admin@vision.fk.adm.br",
        validation_alias=AliasChoices("ADMIN_EMAIL", "ADMIN_INITIAL_EMAIL"),
    )
    ADMIN_PASSWORD: str = Field(
        default="Admin@ATC2026!",
        validation_alias=AliasChoices("ADMIN_PASSWORD", "ADMIN_INITIAL_PASSWORD"),
    )
    ADMIN_NAME: str = "Administrador ATC"

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/atc_vision"
    )

    # Storage Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STORAGE_DIR: Path = Field(
        default=Path("/app/storage/uploads"),
        validation_alias=AliasChoices("STORAGE_DIR", "STORAGE_PATH"),
    )
    WATCH_FOLDER_DIR: Path = Field(
        default=Path("/app/storage/watch"),
        validation_alias=AliasChoices("WATCH_FOLDER_DIR", "WATCH_FOLDER_PATH", "WATCH_FOLDER"),
    )

    # OCR Settings
    OCR_ENABLED: bool = True
    OCR_MIN_CHARS_PER_PAGE: int = 40
    OCR_TIMEOUT_SECONDS: int = 900

    # Operational daily cutoffs
    DAILY_CUTOFF_START: str = "06:00"
    DAILY_CUTOFF_END: str = "06:00"
    TIMEZONE: str = "America/Sao_Paulo"
    DEFAULT_HOME: str = "daily"

    # Bad Actor default analysis window (days)
    BAD_ACTOR_DEFAULT_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = [
        "https://vision.fk.adm.br",
        "http://vision.fk.adm.br",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8085",
        "http://127.0.0.1:8085",
    ]

    @field_validator("STORAGE_DIR", "WATCH_FOLDER_DIR", mode="after")
    @classmethod
    def resolve_paths(cls, v: Path) -> Path:
        try:
            v.mkdir(parents=True, exist_ok=True)
            return v
        except Exception:
            # Fallback to local ./data or /tmp/atc_vision if path creation is denied
            fallback = Path("./data") / v.name
            try:
                fallback.mkdir(parents=True, exist_ok=True)
                return fallback
            except Exception:
                tmp_fallback = Path("/tmp/atc_vision") / v.name
                tmp_fallback.mkdir(parents=True, exist_ok=True)
                return tmp_fallback


settings = Settings()
