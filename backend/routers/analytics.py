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
    CoachAthlete,
    CoachAthleteGroup,
    GroupSummaryItem,
    GroupSummaryResponse,
    GroupWeekAthlete,
    GroupWeekWorkout,
    LoadPoint,
    LoadResponse,
    PlanFactPoint,
    PlanFactResponse,
    VolumeByType,
    VolumeResponse,
    VolumeWeekEntry,
    VolumeWeekPoint,
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


@router.get("/volume/{athlete_id}", response_model=VolumeResponse)
async def get_volume(
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

    # Только тренировки с фактической телеметрией
    result = await db.execute(
        select(
            IndividualWorkout.planned_date,
            IndividualWorkout.workout_type,
            ActualTelemetry.actual_duration_min,
            ActualTelemetry.distance_km,
        )
        .join(ActualTelemetry, ActualTelemetry.workout_id == IndividualWorkout.id)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.planned_date >= d_from,
            IndividualWorkout.planned_date <= d_to,
        )
    )
    rows = result.all()

    # Агрегация по типу
    type_duration: dict[str, int] = defaultdict(int)
    type_distance: dict[str, Decimal] = defaultdict(Decimal)
    type_sessions: dict[str, int] = defaultdict(int)

    # Агрегация по неделе + типу
    week_type_dur: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    week_type_km:  dict[date, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

    # Агрегация по дню + типу
    day_type_dur: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    day_type_km:  dict[date, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

    for planned_date, workout_type, duration_min, distance_km in rows:
        wt = workout_type or "other"
        dur = duration_min or 0
        km  = distance_km or Decimal(0)

        type_duration[wt] += dur
        type_distance[wt] += km
        type_sessions[wt] += 1

        ws = planned_date - timedelta(days=planned_date.weekday())
        week_type_dur[ws][wt] += dur
        week_type_km[ws][wt]  += km

        day_type_dur[planned_date][wt] += dur
        day_type_km[planned_date][wt]  += km

    def _make_chart_points(
        dur_map: dict[date, dict[str, int]],
        km_map: dict[date, dict[str, Decimal]],
    ) -> list[VolumeWeekPoint]:
        all_dates = sorted(set(dur_map) | set(km_map))
        return [
            VolumeWeekPoint(
                week_start=d,
                entries=[
                    VolumeWeekEntry(
                        workout_type=wt,
                        duration_min=dur_map[d][wt],
                        distance_km=float(km_map[d][wt]) if km_map[d][wt] > 0 else None,
                    )
                    for wt in sorted(dur_map[d], key=lambda t: -dur_map[d][t])
                ],
            )
            for d in all_dates
        ]

    by_type = [
        VolumeByType(
            workout_type=wt,
            total_duration_min=type_duration[wt],
            total_distance_km=float(type_distance[wt]) if type_distance[wt] > 0 else None,
            sessions=type_sessions[wt],
        )
        for wt in sorted(type_duration, key=lambda t: -type_duration[t])
    ]

    return VolumeResponse(
        athlete_id=athlete_id,
        by_type=by_type,
        weekly=_make_chart_points(week_type_dur, week_type_km),
        daily=_make_chart_points(day_type_dur, day_type_km),
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


@router.get("/coach-athletes", response_model=list[CoachAthlete])
async def get_coach_athletes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    # Все группы тренера
    groups_result = await db.execute(
        select(TrainingGroup).where(TrainingGroup.coach_user_id == current_user.id)
    )
    groups = groups_result.scalars().all()
    if not groups:
        return []

    group_ids = [g.id for g in groups]
    group_by_id = {g.id: g for g in groups}

    # Все активные участники с привязкой к группам
    memberships_result = await db.execute(
        select(GroupMembership)
        .where(GroupMembership.group_id.in_(group_ids), GroupMembership.is_active.is_(True))
    )
    memberships = memberships_result.scalars().all()

    athlete_ids_set: set[uuid.UUID] = {m.athlete_id for m in memberships}
    if not athlete_ids_set:
        return []
    athlete_ids = list(athlete_ids_set)

    # Группы каждого атлета
    athlete_groups: dict[uuid.UUID, list[CoachAthleteGroup]] = defaultdict(list)
    for m in memberships:
        g = group_by_id[m.group_id]
        athlete_groups[m.athlete_id].append(CoachAthleteGroup(id=g.id, name=g.name))

    # Профили атлетов
    profiles_result = await db.execute(
        select(AthleteProfile)
        .where(AthleteProfile.id.in_(athlete_ids))
        .order_by(AthleteProfile.last_name, AthleteProfile.first_name)
    )
    profiles = profiles_result.scalars().all()

    # Последние показатели нагрузки
    latest_date_subq = (
        select(
            TrainingLoadHistory.athlete_id,
            func.max(TrainingLoadHistory.date).label("max_date"),
        )
        .where(TrainingLoadHistory.athlete_id.in_(athlete_ids))
        .group_by(TrainingLoadHistory.athlete_id)
        .subquery()
    )
    load_result = await db.execute(
        select(
            TrainingLoadHistory.athlete_id,
            TrainingLoadHistory.tsb,
            TrainingLoadHistory.atl_7d,
            TrainingLoadHistory.ctl_42d,
        )
        .join(
            latest_date_subq,
            and_(
                TrainingLoadHistory.athlete_id == latest_date_subq.c.athlete_id,
                TrainingLoadHistory.date == latest_date_subq.c.max_date,
            ),
        )
    )
    load_map: dict[uuid.UUID, tuple] = {
        row.athlete_id: (row.tsb, row.atl_7d, row.ctl_42d) for row in load_result
    }

    # Количество и наивысший уровень активных алертов
    alerts_result = await db.execute(
        select(DiagnosticAlert.athlete_id, DiagnosticAlert.severity)
        .where(
            DiagnosticAlert.athlete_id.in_(athlete_ids),
            DiagnosticAlert.is_resolved.is_(False),
        )
    )
    _sev_order = {"critical": 3, "warning": 2, "info": 1}
    alert_count_map: dict[uuid.UUID, int] = defaultdict(int)
    alert_sev_map: dict[uuid.UUID, str] = {}
    for row in alerts_result:
        alert_count_map[row.athlete_id] += 1
        cur = alert_sev_map.get(row.athlete_id)
        if cur is None or _sev_order.get(row.severity, 0) > _sev_order.get(cur, 0):
            alert_sev_map[row.athlete_id] = row.severity

    # Статус последней тренировки
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

    return [
        CoachAthlete(
            athlete_id=p.id,
            full_name=f"{p.first_name} {p.last_name}",
            groups=sorted(athlete_groups.get(p.id, []), key=lambda g: g.name),
            tsb=float(load_map[p.id][0]) if p.id in load_map else None,
            atl=float(load_map[p.id][1]) if p.id in load_map else None,
            ctl=float(load_map[p.id][2]) if p.id in load_map else None,
            active_alerts=alert_count_map[p.id],
            alert_severity=alert_sev_map.get(p.id),
            last_workout_status=workout_status_map.get(p.id),
        )
        for p in profiles
    ]


@router.get("/group-week/{group_id}", response_model=list[GroupWeekAthlete])
async def get_group_week(
    group_id: uuid.UUID,
    week_start: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_group_access(group_id, db, current_user)

    today = date.today()
    ws = week_start or (today - timedelta(days=today.weekday()))
    we = ws + timedelta(days=6)

    # Активные атлеты группы
    members_result = await db.execute(
        select(AthleteProfile)
        .join(GroupMembership, GroupMembership.athlete_id == AthleteProfile.id)
        .where(GroupMembership.group_id == group_id, GroupMembership.is_active.is_(True))
        .order_by(AthleteProfile.last_name, AthleteProfile.first_name)
    )
    profiles = members_result.scalars().all()
    if not profiles:
        return []

    athlete_ids = [p.id for p in profiles]

    # Тренировки за неделю
    workouts_result = await db.execute(
        select(IndividualWorkout)
        .where(
            IndividualWorkout.athlete_id.in_(athlete_ids),
            IndividualWorkout.planned_date >= ws,
            IndividualWorkout.planned_date <= we,
        )
        .order_by(IndividualWorkout.planned_date)
    )
    workouts = workouts_result.scalars().all()

    # Один лучший workout на (athlete, date): completed > published > draft
    _STATUS_PRIORITY = {"completed": 3, "published": 2, "draft": 1}
    best_by_key: dict[tuple[uuid.UUID, date], IndividualWorkout] = {}
    for w in workouts:
        key = (w.athlete_id, w.planned_date)
        existing = best_by_key.get(key)
        if existing is None or _STATUS_PRIORITY.get(w.status, 0) > _STATUS_PRIORITY.get(existing.status, 0):
            best_by_key[key] = w

    workouts_by_athlete: dict[uuid.UUID, list[IndividualWorkout]] = defaultdict(list)
    for w in best_by_key.values():
        workouts_by_athlete[w.athlete_id].append(w)

    # Фактическая телеметрия
    workout_ids = [w.id for w in workouts]
    tel_map: dict[uuid.UUID, ActualTelemetry] = {}
    if workout_ids:
        tel_result = await db.execute(
            select(ActualTelemetry).where(ActualTelemetry.workout_id.in_(workout_ids))
        )
        for t in tel_result.scalars().all():
            tel_map[t.workout_id] = t

    # Последние показатели нагрузки (TSB, ATL, CTL) каждого атлета
    latest_date_subq = (
        select(
            TrainingLoadHistory.athlete_id,
            func.max(TrainingLoadHistory.date).label("max_date"),
        )
        .where(TrainingLoadHistory.athlete_id.in_(athlete_ids))
        .group_by(TrainingLoadHistory.athlete_id)
        .subquery()
    )
    load_result = await db.execute(
        select(
            TrainingLoadHistory.athlete_id,
            TrainingLoadHistory.tsb,
            TrainingLoadHistory.atl_7d,
            TrainingLoadHistory.ctl_42d,
        )
        .join(
            latest_date_subq,
            and_(
                TrainingLoadHistory.athlete_id == latest_date_subq.c.athlete_id,
                TrainingLoadHistory.date == latest_date_subq.c.max_date,
            ),
        )
    )
    load_map: dict[uuid.UUID, tuple[Decimal, Decimal, Decimal]] = {
        row.athlete_id: (row.tsb, row.atl_7d, row.ctl_42d) for row in load_result
    }

    # Наивысший уровень алерта каждого атлета
    alerts_result = await db.execute(
        select(DiagnosticAlert.athlete_id, DiagnosticAlert.severity)
        .where(
            DiagnosticAlert.athlete_id.in_(athlete_ids),
            DiagnosticAlert.is_resolved.is_(False),
        )
    )
    _sev_order = {"critical": 3, "warning": 2, "info": 1}
    alert_sev_map: dict[uuid.UUID, str] = {}
    for row in alerts_result:
        cur = alert_sev_map.get(row.athlete_id)
        if cur is None or _sev_order.get(row.severity, 0) > _sev_order.get(cur, 0):
            alert_sev_map[row.athlete_id] = row.severity

    return [
        GroupWeekAthlete(
            athlete_id=p.id,
            full_name=f"{p.first_name} {p.last_name}",
            tsb=float(load_map[p.id][0]) if p.id in load_map else None,
            atl=float(load_map[p.id][1]) if p.id in load_map else None,
            ctl=float(load_map[p.id][2]) if p.id in load_map else None,
            alert_severity=alert_sev_map.get(p.id),
            workouts=[
                GroupWeekWorkout(
                    id=w.id,
                    planned_date=w.planned_date,
                    workout_type=w.workout_type,
                    workout_subtype=w.workout_subtype,
                    target_zone=w.target_zone,
                    planned_duration_min=w.planned_duration_min,
                    planned_tss=w.planned_tss,
                    actual_tss=tel_map[w.id].actual_tss if w.id in tel_map else None,
                    actual_duration_min=tel_map[w.id].actual_duration_min if w.id in tel_map else None,
                    distance_km=tel_map[w.id].distance_km if w.id in tel_map else None,
                    avg_hr=tel_map[w.id].avg_hr if w.id in tel_map else None,
                    max_hr=tel_map[w.id].max_hr if w.id in tel_map else None,
                    hr_zone1_min=tel_map[w.id].hr_zone1_min if w.id in tel_map else None,
                    hr_zone2_min=tel_map[w.id].hr_zone2_min if w.id in tel_map else None,
                    hr_zone3_min=tel_map[w.id].hr_zone3_min if w.id in tel_map else None,
                    hr_zone4_min=tel_map[w.id].hr_zone4_min if w.id in tel_map else None,
                    hr_zone5_min=tel_map[w.id].hr_zone5_min if w.id in tel_map else None,
                    status=w.status,
                    description=w.description,
                    interval_structure=w.interval_structure,
                )
                for w in workouts_by_athlete[p.id]
            ],
        )
        for p in profiles
    ]
