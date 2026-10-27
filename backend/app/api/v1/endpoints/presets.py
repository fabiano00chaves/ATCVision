from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import FilterPreset, User
from app.db.session import get_db
from app.schemas.preset import PresetCreate, PresetOut, PresetUpdate

router = APIRouter()


@router.get("", response_model=List[PresetOut])
async def list_presets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(FilterPreset).order_by(FilterPreset.sort_order.asc(), FilterPreset.name.asc()))
    presets = res.scalars().all()
    return [PresetOut.model_validate(p) for p in presets]


@router.post("", response_model=PresetOut, status_code=status.HTTP_201_CREATED)
async def create_preset(
    payload: PresetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preset = FilterPreset(
        name=payload.name.strip(),
        icon=payload.icon,
        color=payload.color,
        is_default=payload.is_default,
        show_in_quickbar=payload.show_in_quickbar,
        sort_order=payload.sort_order,
        filter_payload=payload.filter_payload,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return PresetOut.model_validate(preset)


@router.put("/{preset_id}", response_model=PresetOut)
async def update_preset(
    preset_id: str,
    payload: PresetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(FilterPreset).where(FilterPreset.id == preset_id))
    preset = res.scalar_one_or_none()
    if not preset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Filtro pré-cadastrado não encontrado")

    if payload.name is not None:
        preset.name = payload.name.strip()
    if payload.icon is not None:
        preset.icon = payload.icon
    if payload.color is not None:
        preset.color = payload.color
    if payload.is_default is not None:
        preset.is_default = payload.is_default
    if payload.show_in_quickbar is not None:
        preset.show_in_quickbar = payload.show_in_quickbar
    if payload.sort_order is not None:
        preset.sort_order = payload.sort_order
    if payload.filter_payload is not None:
        preset.filter_payload = payload.filter_payload

    await db.commit()
    await db.refresh(preset)
    return PresetOut.model_validate(preset)


@router.delete("/{preset_id}")
async def delete_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(FilterPreset).where(FilterPreset.id == preset_id))
    preset = res.scalar_one_or_none()
    if not preset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Filtro pré-cadastrado não encontrado")

    await db.delete(preset)
    await db.commit()
    return {"ok": True, "message": "Filtro pré-cadastrado excluído com sucesso"}
