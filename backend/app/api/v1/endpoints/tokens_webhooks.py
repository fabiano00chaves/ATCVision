from __future__ import annotations

import hashlib
import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.models import ApiToken, User, Webhook
from app.db.session import get_db
from app.schemas.setting import (
    ApiTokenCreate,
    ApiTokenCreatedOut,
    ApiTokenOut,
    WebhookCreate,
    WebhookOut,
    WebhookUpdate,
)

router = APIRouter()


# ---------- API Tokens ----------

@router.get("/api-tokens", response_model=List[ApiTokenOut])
async def list_api_tokens(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(ApiToken).order_by(ApiToken.created_at.desc()))
    tokens = res.scalars().all()
    return [ApiTokenOut.model_validate(t) for t in tokens]


@router.post("/api-tokens", response_model=ApiTokenCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_api_token(
    payload: ApiTokenCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    raw_token = f"atc_{secrets.token_urlsafe(32)}"
    prefix = raw_token[:8]
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    token_obj = ApiToken(
        name=payload.name.strip(),
        token_hash=token_hash,
        prefix=prefix,
    )
    db.add(token_obj)
    await db.commit()
    await db.refresh(token_obj)

    return ApiTokenCreatedOut(
        token=raw_token,
        item=ApiTokenOut.model_validate(token_obj),
    )


@router.delete("/api-tokens/{token_id}")
async def revoke_api_token(
    token_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(ApiToken).where(ApiToken.id == token_id))
    token = res.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token não encontrado")

    await db.delete(token)
    await db.commit()
    return {"ok": True, "message": "Token revogado com sucesso"}


# ---------- Webhooks ----------

@router.get("/webhooks", response_model=List[WebhookOut])
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(Webhook).order_by(Webhook.created_at.desc()))
    webhooks = res.scalars().all()
    return [WebhookOut.model_validate(w) for t, w in enumerate(webhooks)]


@router.post("/webhooks", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    wh = Webhook(
        name=payload.name.strip(),
        target_url=payload.target_url.strip(),
        events=payload.events,
        is_active=payload.is_active,
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return WebhookOut.model_validate(wh)


@router.put("/webhooks/{webhook_id}", response_model=WebhookOut)
async def update_webhook(
    webhook_id: str,
    payload: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook não encontrado")

    if payload.name is not None:
        wh.name = payload.name.strip()
    if payload.target_url is not None:
        wh.target_url = payload.target_url.strip()
    if payload.events is not None:
        wh.events = payload.events
    if payload.is_active is not None:
        wh.is_active = payload.is_active

    await db.commit()
    await db.refresh(wh)
    return WebhookOut.model_validate(wh)


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook não encontrado")

    await db.delete(wh)
    await db.commit()
    return {"ok": True, "message": "Webhook excluído com sucesso"}
