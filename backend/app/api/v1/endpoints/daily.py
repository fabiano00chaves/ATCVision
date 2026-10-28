from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.setting import DailyWindowOut
from app.services.occurrence_service import get_system_settings

router = APIRouter()


@router.get("/window", response_model=DailyWindowOut)
async def get_daily_window(
    mode: str = Query("last24", pattern="^(last24|weekend|days|all)$"),
    n: int = Query(3, ge=1, le=30),
    ref: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if mode == "all":
        return DailyWindowOut(
            start="",
            end="",
            label="Todo o Período Cadastrado",
        )

    sys_settings = await get_system_settings(db)
    cutoff_time_str = sys_settings.get("daily_cutoff_start", "06:00")
    try:
        parts = [int(p) for p in cutoff_time_str.split(":")]
        cutoff_time = time(parts[0], parts[1], 0)
    except Exception:
        cutoff_time = time(6, 0, 0)

    # Reference date
    if ref:
        try:
            ref_date = date.fromisoformat(ref)
        except ValueError:
            ref_date = date.today()
    else:
        ref_date = date.today()

    if mode == "last24":
        # ref - 1 day 06:00 to ref 06:00
        start_dt = datetime.combine(ref_date - timedelta(days=1), cutoff_time)
        end_dt = datetime.combine(ref_date, cutoff_time)
        label = f"Último Turno (24h) — {start_dt.strftime('%d/%m %H:%M')} até {end_dt.strftime('%d/%m %H:%M')}"

    elif mode == "weekend":
        # Previous Friday 06:00 to Monday 06:00 of the reference week
        # Monday is weekday 0, Friday is weekday 4, Sunday is 6
        days_since_monday = ref_date.weekday()
        # Monday of current week
        mon = ref_date - timedelta(days=days_since_monday)
        # Friday before that Monday
        fri = mon - timedelta(days=3)
        start_dt = datetime.combine(fri, cutoff_time)
        end_dt = datetime.combine(mon, cutoff_time)
        label = f"Pós-Final de Semana — Sex {start_dt.strftime('%d/%m %H:%M')} até Seg {end_dt.strftime('%d/%m %H:%M')}"

    else:  # days (accumulated / holiday)
        start_dt = datetime.combine(ref_date - timedelta(days=n), cutoff_time)
        end_dt = datetime.combine(ref_date, cutoff_time)
        label = f"Acumulado ({n} dias) — {start_dt.strftime('%d/%m %H:%M')} até {end_dt.strftime('%d/%m %H:%M')}"

    return DailyWindowOut(
        start=start_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        end=end_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        label=label,
    )
