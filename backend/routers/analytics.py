import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.alerts import DiagnosticAlert
from backend.models.athlete import AthleteProfile, TrainingLoadHistory
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout
from backend.models.telemetry import ActualTelemetry
from backend.models.user import User
from backend.schemas.analytics import (
    AlertRead,
    GroupSummaryItem,
    GroupSummaryResponse,
    LoadPoint,
    LoadResponse,
    PlanFactPoint,
    PlanFactResponse,
)

router = APIRouter()

_DEFAULT_DAYS = 90


# ── Вспомогательные функции доступа ─────────────────────────────────────────


async def _require_athlete_access(
    athlete_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> AthleteProfile:
    """Проверяет право доступа к данным атлета и возвращает его профиль."""
    profile = await db.get(AthleteProfile, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Атлет не найден")

    if current_user.role == "admin":
        return profile

    if current_user.role == "athlete":
        if profile.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return profile

    # coach — атлет должен быть в одной из его групп
    result = await db.execute(
        select(GroupMembership)
        .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
        .where(
            GroupMembership.athlete_id == athlete_id,
            GroupMembership.is_active.is_(True),
            TrainingGroup.coach_user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return profile


async def _require_group_access(
    group_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> TrainingGroup:
    """Проверяет право доступа к данным группы и возвращает её."""
    group = await db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")

    if current_user.role == "admin":
        return group

    if current_user.role == "coach" and group.coach_user_id == current_user.id:
        return group

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


# ── Эндпоинты ────────────────────────────────────────────────────────────────


@router.get("/load/{athlete_id}", response_model=LoadResponse)
async def get_load(
    athlete_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_athlete_access(athlete_id, db, current_user)

    today = date.today()
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=_DEFAULT_DAYS - 1))

    result = await db.execute(
        select(TrainingLoadHistory)
        .where(
            TrainingLoadHistory.athlete_id == athlete_id,
            TrainingLoadHistory.date >= d_from,
            TrainingLoadHistory.date <= d_to,
        )
        .order_by(TrainingLoadHistory.date)
    )
    rows = result.scalars().all()

    return LoadResponse(
        athlete_id=athlete_id,
        data=[
            LoadPoint(
                date=r.date,
                daily_tss=r.daily_tss,
                atl_7d=r.atl_7d,
                ctl_42d=r.ctl_42d,
                tsb=r.tsb,
            )
            for r in rows
        ],
    )


@router.get("/plan-fact/{athlete_id}", response_model=PlanFactResponse)
async def get_plan_fact(
    athlete_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_athlete_access(athlete_id, db, current_user)

    today = date.today()
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=_DEFAULT_DAYS - 1))

    # LEFT JOIN: берём все опубликованные/завершённые тренировки + телеметрию если есть
    result = await db.execute(
        select(IndividualWorkout.planned_date, IndividualWorkout.planned_tss, ActualTelemetry.actual_tss)
        .outerjoin(ActualTelemetry, ActualTelemetry.workout_id == IndividualWorkout.id)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.status.in_(["published", "completed"]),
            IndividualWorkout.planned_date >= d_from,
            IndividualWorkout.planned_date <= d_to,
        )
        .order_by(IndividualWorkout.planned_date)
    )
    rows = result.all()

    # Агрегация по неделям (понедельник — начало недели)
    planned_by_week: dict[date, Decimal] = defaultdict(Decimal)
    actual_by_week: dict[date, Decimal] = defaultdict(Decimal)

    for planned_date, planned_tss, actual_tss in rows:
        week_start = planned_date - timedelta(days=planned_date.weekday())
        planned_by_week[week_start] += planned_tss or Decimal(0)
        actual_by_week[week_start] += actual_tss or Decimal(0)

    weeks = sorted(set(planned_by_week) | set(actual_by_week))
    return PlanFactResponse(
        athlete_id=athlete_id,
        data=[
            PlanFactPoint(
                week_start=w,
                planned_tss=planned_by_week[w],
                actual_tss=actual_by_week[w],
            )
            for w in weeks
        ],
    )


@router.get("/alerts/{athlete_id}", response_model=list[AlertRead])
async def get_alerts(
    athlete_id: uuid.UUID,
    include_resolved: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_athlete_access(athlete_id, db, current_user)

    stmt = select(DiagnosticAlert).where(DiagnosticAlert.athlete_id == athlete_id)
    if not include_resolved:
        stmt = stmt.where(DiagnosticAlert.is_resolved.is_(False))
    stmt = stmt.order_by(DiagnosticAlert.created_at.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/alerts/{alert_id}/resolve", response_model=AlertRead)
async def resolve_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = await db.get(DiagnosticAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Алерт не найден")

    # Атлет может закрыть только свой алерт; тренер — атлета из своей группы
    await _require_athlete_access(alert.athlete_id, db, current_user)

    alert.is_resolved = True
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("/group-summary/{group_id}", response_model=GroupSummaryResponse)
async def get_group_summary(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_access(group_id, db, current_user)

    # Все активные участники группы с профилями
    members_result = await db.execute(
        select(AthleteProfile)
        .join(GroupMembership, GroupMembership.athlete_id == AthleteProfile.id)
        .where(
            GroupMembership.group_id == group_id,
            GroupMembership.is_active.is_(True),
        )
        .order_by(AthleteProfile.last_name, AthleteProfile.first_name)
    )
    profiles = members_result.scalars().all()

    if not profiles:
        return GroupSummaryResponse(group_id=group_id, athletes=[])

    athlete_ids = [p.id for p in profiles]

    # Количество активных алертов по каждому атлету
    alerts_result = await db.execute(
        select(DiagnosticAlert.athlete_id, func.count(DiagnosticAlert.id).label("cnt"))
        .where(
            DiagnosticAlert.athlete_id.in_(athlete_ids),
            DiagnosticAlert.is_resolved.is_(False),
        )
        .group_by(DiagnosticAlert.athlete_id)
    )
    alert_counts: dict[uuid.UUID, int] = {row.athlete_id: row.cnt for row in alerts_result}

    # Последний TSB каждого атлета (строка с максимальной датой)
    latest_date_subq = (
        select(
            TrainingLoadHistory.athlete_id,
            func.max(TrainingLoadHistory.date).label("max_date"),
        )
        .where(TrainingLoadHistory.athlete_id.in_(athlete_ids))
        .group_by(TrainingLoadHistory.athlete_id)
        .subquery()
    )
    tsb_result = await db.execute(
        select(TrainingLoadHistory.athlete_id, TrainingLoadHistory.tsb)
        .join(
            latest_date_subq,
            and_(
                TrainingLoadHistory.athlete_id == latest_date_subq.c.athlete_id,
                TrainingLoadHistory.date == latest_date_subq.c.max_date,
            ),
        )
    )
    tsb_map: dict[uuid.UUID, Decimal] = {row.athlete_id: row.tsb for row in tsb_result}

    # Статус последней тренировки каждого атлета (исключаем черновики)
    latest_workout_subq = (
        select(
            IndividualWorkout.athlete_id,
            func.max(IndividualWorkout.planned_date).label("max_date"),
        )
        .where(
            IndividualWorkout.athlete_id.in_(athlete_ids),
            IndividualWorkout.status != "draft",
        )
        .group_by(IndividualWorkout.athlete_id)
        .subquery()
    )
    workout_result = await db.execute(
        select(IndividualWorkout.athlete_id, IndividualWorkout.status)
        .join(
            latest_workout_subq,
            and_(
                IndividualWorkout.athlete_id == latest_workout_subq.c.athlete_id,
                IndividualWorkout.planned_date == latest_workout_subq.c.max_date,
            ),
        )
    )
    workout_status_map: dict[uuid.UUID, str] = {
        row.athlete_id: row.status for row in workout_result
    }

    return GroupSummaryResponse(
        group_id=group_id,
        athletes=[
            GroupSummaryItem(
                athlete_id=p.id,
                full_name=f"{p.first_name} {p.last_name}",
                active_alerts=alert_counts.get(p.id, 0),
                tsb=tsb_map.get(p.id),
                last_workout_status=workout_status_map.get(p.id),
            )
            for p in profiles
        ],
    )
