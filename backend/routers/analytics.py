import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.schemas.analytics import AlertRead, GroupSummaryResponse, LoadResponse, PlanFactResponse

router = APIRouter()


@router.get("/load/{athlete_id}", response_model=LoadResponse)
async def get_load(
    athlete_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: ATL/CTL/TSB за период из training_load_history
    pass


@router.get("/plan-fact/{athlete_id}", response_model=PlanFactResponse)
async def get_plan_fact(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: план-факт по неделям
    pass


@router.get("/alerts/{athlete_id}", response_model=list[AlertRead])
async def get_alerts(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: активные алерты атлета
    pass


@router.put("/alerts/{alert_id}/resolve", response_model=AlertRead)
async def resolve_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: отметить алерт решённым
    pass


@router.get("/group-summary/{group_id}", response_model=GroupSummaryResponse)
async def get_group_summary(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: сводка по группе: алерты, TSB, статусы
    pass
