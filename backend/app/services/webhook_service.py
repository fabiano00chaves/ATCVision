from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, List
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Webhook

log = logging.getLogger("atc.webhook")


async def trigger_webhooks(db: AsyncSession, event_name: str, payload: Dict[str, Any]) -> None:
    res = await db.execute(select(Webhook).where(Webhook.is_active.is_(True)))
    webhooks = res.scalars().all()

    active_for_event = [w for w in webhooks if event_name in (w.events or [])]
    if not active_for_event:
        return

    body_bytes = json.dumps(payload, default=str).encode("utf-8")

    async def _send(w: Webhook):
        sig = hmac.new(w.secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-ATC-Event": event_name,
            "X-ATC-Signature": f"sha256={sig}",
            "User-Agent": "ATCVision-Webhook/1.0",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(w.target_url, content=body_bytes, headers=headers)
                log.info("Webhook %s (%s) response status: %s", w.name, w.target_url, resp.status_code)
        except Exception as exc:
            log.warning("Failed to deliver webhook %s (%s): %s", w.name, w.target_url, exc)

    for w in active_for_event:
        asyncio.create_task(_send(w))
