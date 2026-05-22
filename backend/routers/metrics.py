import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import require_athlete
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile, SubjectiveMetric
from backend.models.user import User
from backend.schemas.telemetry import SubjectiveMetricCreate, SubjectiveMetricRead
from backend.services.analytics import generate_alerts

router = APIRouter()


async def _get_profile(user_id: uuid.UUID, db: AsyncSession) -> AthleteProfile:
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль спортсмена не найден",
        )
    return profile


@router.post("", response_model=SubjectiveMetricRead, status_code=201)
async def create_metric(
    data: SubjectiveMetricCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_athlete),
):
    profile = await _get_profile(current_user.id, db)

    record_date = data.date_recorded or date.today()

    # Один атлет — одна запись на дату (upsert: обновить если уже есть)
    result = await db.execute(
        select(SubjectiveMetric).where(
            SubjectiveMetric.athlete_id == profile.id,
            SubjectiveMetric.date_recorded == record_date,
        )
    )
    metric = result.scalar_one_or_none()

    if metric is None:
        metric = SubjectiveMetric(
            athlete_id=profile.id,
            date_recorded=record_date,
        )
        db.add(metric)

    metric.sleep_quality = data.sleep_quality
    metric.sleep_hours = data.sleep_hours
    metric.fatigue_level = data.fatigue_level
    metric.hrv_value = data.hrv_value

    await db.commit()
    await db.refresh(metric)

    await generate_alerts(
        profile.id,
        db,
        triggered_by_subjective_id=metric.id,
    )

    return metric


@router.get("/today", response_model=SubjectiveMetricRead | None)
async def get_today_metric(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_athlete),
):
    profile = await _get_profile(current_user.id, db)

    result = await db.execute(
        select(SubjectiveMetric).where(
            SubjectiveMetric.athlete_id == profile.id,
            SubjectiveMetric.date_recorded == date.today(),
        )
    )
    return result.scalar_one_or_none()
