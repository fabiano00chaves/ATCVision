from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.db.session import async_session_factory
from app.services.occurrence_service import get_system_settings, ingest_pdf_file
from app.services.webhook_service import trigger_webhooks

log = logging.getLogger("atc.watch_folder")

_watch_task: Optional[asyncio.Task] = None


async def process_inbox_folder() -> None:
    inbox = Path(settings.WATCH_FOLDER_DIR)
    if not inbox.exists():
        return

    processed_dir = inbox / "processed"
    error_dir = inbox / "error"
    processed_dir.mkdir(parents=True, exist_ok=True)
    error_dir.mkdir(parents=True, exist_ok=True)

    # Find pdf files in inbox root (exclude subdirs)
    for entry in inbox.iterdir():
        if entry.is_file() and entry.suffix.lower() == ".pdf":
            # Wait for file write to complete by checking stable size
            try:
                size1 = entry.stat().st_size
                await asyncio.sleep(0.5)
                size2 = entry.stat().st_size
                if size1 != size2 or size1 == 0:
                    continue  # Still writing
            except OSError:
                continue

            log.info("Watch folder found new PDF: %s", entry.name)
            async with async_session_factory() as db:
                try:
                    sys_settings = await get_system_settings(db)
                    if not sys_settings.get("watch_folder_enabled", True):
                        continue

                    doc, created, updated, status = await ingest_pdf_file(
                        db, entry, entry.name, source="WATCH_FOLDER"
                    )
                    log.info("Ingested %s: status=%s, created=%d, updated=%d", entry.name, status, created, updated)

                    # Move to processed
                    dest = processed_dir / f"{int(asyncio.get_event_loop().time())}_{entry.name}"
                    shutil.move(str(entry), str(dest))

                    if doc:
                        await trigger_webhooks(
                            db,
                            "document.ingested",
                            {
                                "document_id": doc.id,
                                "filename": doc.filename,
                                "occurrences_created": created,
                                "occurrences_updated": updated,
                                "source": "WATCH_FOLDER",
                            },
                        )
                except Exception as exc:
                    log.exception("Error processing watch folder file %s: %s", entry.name, exc)
                    dest_err = error_dir / f"{int(asyncio.get_event_loop().time())}_{entry.name}"
                    try:
                        shutil.move(str(entry), str(dest_err))
                    except Exception:
                        pass


async def watch_folder_loop(interval_seconds: int = 15) -> None:
    log.info("Starting watch folder monitoring on: %s", settings.WATCH_FOLDER_DIR)
    while True:
        try:
            await process_inbox_folder()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            log.warning("Watch folder loop error: %s", exc)
        await asyncio.sleep(interval_seconds)


def start_watch_folder_background():
    global _watch_task
    if _watch_task is None or _watch_task.done():
        _watch_task = asyncio.create_task(watch_folder_loop())


def stop_watch_folder_background():
    global _watch_task
    if _watch_task and not _watch_task.done():
        _watch_task.cancel()
