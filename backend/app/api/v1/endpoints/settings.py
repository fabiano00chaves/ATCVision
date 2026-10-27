from __future__ import annotations

from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.db.models import SystemSetting, User
from app.db.session import get_db
from app.schemas.setting import SettingsPayload
from app.services.occurrence_service import get_system_settings

router = APIRouter()


@router.get("", response_model=SettingsPayload)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await get_system_settings(db)
    return SettingsPayload(**data)


@router.put("", response_model=SettingsPayload)
async def update_settings(
    payload: SettingsPayload,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    res = await db.execute(select(SystemSetting).where(SystemSetting.key == "general"))
    row = res.scalar_one_or_none()
    new_values = payload.model_dump()
    if not row:
        row = SystemSetting(key="general", value=new_values)
        db.add(row)
    else:
        row.value = new_values

    await db.commit()
    await db.refresh(row)
    return SettingsPayload(**row.value)
