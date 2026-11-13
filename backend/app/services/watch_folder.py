from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
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
    async with async_session_factory() as db:
        sys_settings = await get_system_settings(db)
        if not sys_settings.get("watch_folder_enabled", True):
            return
        custom_path = sys_settings.get("watch_folder_path")
        if custom_path:
            p = Path(custom_path)
            if p.exists():
                inbox = p

    if not inbox.exists():
        return

    processed_dir = inbox / "processed"
    error_dir = inbox / "error"
    processing_dir = inbox / ".processing"
    processed_dir.mkdir(parents=True, exist_ok=True)
    error_dir.mkdir(parents=True, exist_ok=True)
    processing_dir.mkdir(parents=True, exist_ok=True)

    # Recover stale files abandoned in .processing (older than 5 minutes)
    now_ts = time.time()
    for stale in processing_dir.iterdir():
        if stale.is_file():
            try:
                if now_ts - stale.stat().st_mtime > 300:
                    log.warning("Recovering abandoned processing file: %s", stale.name)
                    dest_stale = error_dir / f"stale_{int(now_ts)}_{stale.name}"
                    shutil.move(str(stale), str(dest_stale))
            except OSError:
                pass

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

            # Concurrency protection: atomic rename to worker's .processing directory
            proc_file = processing_dir / f"{os.getpid()}_{int(time.time() * 1000)}_{entry.name}"
            try:
                shutil.move(str(entry), str(proc_file))
            except (OSError, FileNotFoundError):
                continue  # Another worker already acquired this file

            # Magic bytes validation (%PDF-)
            try:
                with open(proc_file, "rb") as f_chk:
                    magic = f_chk.read(5)
                if not magic.startswith(b"%PDF-"):
                    log.warning("File %s is not a valid PDF (%r). Moving to error directory.", entry.name, magic)
                    dest_err = error_dir / f"{int(time.time())}_{entry.name}"
                    shutil.move(str(proc_file), str(dest_err))
                    continue
            except Exception as read_err:
                log.warning("Failed to verify PDF header for %s: %s", entry.name, read_err)
                continue

            log.info("Watch folder processing reserved PDF: %s", entry.name)
            async with async_session_factory() as db:
                try:
                    doc, created, updated, status = await ingest_pdf_file(
                        db, proc_file, entry.name, source="WATCH_FOLDER"
                    )
                    log.info("Ingested %s: status=%s, created=%d, updated=%d", entry.name, status, created, updated)

                    # Move to processed
                    dest = processed_dir / f"{int(time.time())}_{entry.name}"
                    shutil.move(str(proc_file), str(dest))

                    # Trigger webhook ONLY if newly created (prevents duplicate webhook floods)
                    if doc and status == "created":
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
                    dest_err = error_dir / f"{int(time.time())}_{entry.name}"
                    try:
                        shutil.move(str(proc_file), str(dest_err))
                    except Exception:
                        pass


async def watch_folder_loop(interval_seconds: Optional[int] = None) -> None:
    if interval_seconds is None:
        interval_seconds = getattr(settings, "WATCH_FOLDER_INTERVAL_SECONDS", 60)
    log.info("Starting watch folder monitoring on: %s (interval: %ds)", settings.WATCH_FOLDER_DIR, interval_seconds)
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
        _watch_task = asyncio.create_task(
            watch_folder_loop(settings.WATCH_FOLDER_INTERVAL_SECONDS)
        )


def stop_watch_folder_background():
    global _watch_task
    if _watch_task and not _watch_task.done():
        _watch_task.cancel()
