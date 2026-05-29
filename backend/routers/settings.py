from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.settings import AlertSettings
from backend.models.user import User
from backend.schemas.settings import AlertSettingsRead, AlertSettingsUpdate

router = APIRouter()

_DEFAULTS = AlertSettingsRead(
    p1_tsb_threshold=-30.0,
    p2_resting_hr_pct=7.0,
    p3_hrv_pct=85.0,
    p5_z45_pct=20.0,
    h1_ctl_delta=2.0,
    h2_tsb_high=15.0,
    h3_tss_pct=50.0,
    h5_z12_pct=75.0,
)


async def _get_or_default(db: AsyncSession) -> AlertSettingsRead:
    result = await db.execute(select(AlertSettings).where(AlertSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        return _DEFAULTS
    return AlertSettingsRead.model_validate(row)


@router.get("/alerts", response_model=AlertSettingsRead)
async def get_alert_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_default(db)


@router.put("/alerts", response_model=AlertSettingsRead)
async def update_alert_settings(
    data: AlertSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Только тренер может изменять пороги алертов")

    result = await db.execute(select(AlertSettings).where(AlertSettings.id == 1))
    row = result.scalar_one_or_none()

    if row is None:
        row = AlertSettings(id=1, updated_by_id=current_user.id, **data.model_dump())
        db.add(row)
    else:
        for field, value in data.model_dump().items():
            setattr(row, field, value)
        row.updated_by_id = current_user.id

    await db.commit()
    await db.refresh(row)
    return AlertSettingsRead.model_validate(row)
