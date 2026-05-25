import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile, PhysiologicalMarker
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout
from backend.models.telemetry import ActualTelemetry
from backend.models.user import User
from backend.schemas.athlete import (
    AthleteProfileCreate,
    AthleteProfileRead,
    AthleteProfileUpdate,
    HRZonesResponse,
    PhysiologicalMarkerCreate,
    PhysiologicalMarkerRead,
    WorkoutHistoryItem,
)
from backend.schemas.plan import IndividualWorkoutRead
from backend.services.analytics import calculate_hr_zones

router = APIRouter()


async def _get_accessible_profile(
    athlete_id: uuid.UUID, db: AsyncSession, current_user: User
) -> AthleteProfile:
    """Возвращает профиль атлета если у current_user есть право на просмотр."""
    profile = await db.get(AthleteProfile, athlete_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Профиль атлета не найден")

    if current_user.role == "admin":
        return profile
    if profile.user_id == current_user.id:
        return profile
    if current_user.role == "coach":
        # доступ через прямую привязку тренера
        if profile.coach_user_id == current_user.id:
            return profile
        # доступ через членство в группе тренера
        result = await db.execute(
            select(GroupMembership)
            .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
            .where(
                GroupMembership.athlete_id == athlete_id,
                GroupMembership.is_active == True,
                TrainingGroup.coach_user_id == current_user.id,
            )
            .limit(1)
        )
        if result.first():
            return profile

    raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к профилю атлета")


# ── Список профилей ───────────────────────────────────────────────────────────

@router.get("", response_model=list[AthleteProfileRead])
async def list_athletes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        result = await db.execute(
            select(AthleteProfile).order_by(AthleteProfile.last_name)
        )
        return result.scalars().all()

    if current_user.role == "coach":
        result = await db.execute(
            select(AthleteProfile).order_by(AthleteProfile.last_name)
        )
        return result.scalars().all()

    # athlete — только себя
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    return result.scalars().all()


# ── Создание профиля ──────────────────────────────────────────────────────────

@router.post("", response_model=AthleteProfileRead, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: AthleteProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Профиль уже существует")

    profile = AthleteProfile(user_id=current_user.id, **data.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


# ── Получение / изменение профиля ─────────────────────────────────────────────

@router.get("/me", response_model=AthleteProfileRead)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Профиль не найден")
    return profile


@router.get("/{athlete_id}", response_model=AthleteProfileRead)
async def get_athlete(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_accessible_profile(athlete_id, db, current_user)


@router.put("/{athlete_id}", response_model=AthleteProfileRead)
async def update_athlete(
    athlete_id: uuid.UUID,
    data: AthleteProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = await _get_accessible_profile(athlete_id, db, current_user)
    # атлет не может изменить чужой профиль
    if current_user.role == "athlete" and profile.user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нельзя редактировать чужой профиль")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ── Привязка тренера ──────────────────────────────────────────────────────────

@router.post("/{athlete_id}/bind-coach", response_model=AthleteProfileRead)
async def bind_coach(
    athlete_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только тренер может привязывать атлетов")
    profile = await db.get(AthleteProfile, athlete_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Атлет не найден")
    if profile.coach_user_id and profile.coach_user_id != current_user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Атлет уже привязан к другому тренеру")
    profile.coach_user_id = current_user.id
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{athlete_id}/bind-coach", response_model=AthleteProfileRead)
async def unbind_coach(
    athlete_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только тренер может управлять привязкой")
    profile = await db.get(AthleteProfile, athlete_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Атлет не найден")
    if current_user.role == "coach" and profile.coach_user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нельзя отвязать атлета другого тренера")
    profile.coach_user_id = None
    await db.commit()
    await db.refresh(profile)
    return profile


# ── Физиологические маркеры атлета ────────────────────────────────────────────

@router.get("/{athlete_id}/markers", response_model=list[PhysiologicalMarkerRead])
async def list_markers(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_accessible_profile(athlete_id, db, current_user)
    result = await db.execute(
        select(PhysiologicalMarker)
        .where(PhysiologicalMarker.athlete_id == athlete_id)
        .order_by(PhysiologicalMarker.date_recorded.desc())
    )
    return result.scalars().all()


@router.post("/{athlete_id}/markers", response_model=PhysiologicalMarkerRead,
             status_code=status.HTTP_201_CREATED)
async def create_marker(
    athlete_id: uuid.UUID,
    data: PhysiologicalMarkerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_accessible_profile(athlete_id, db, current_user)

    marker = PhysiologicalMarker(athlete_id=athlete_id, **data.model_dump())
    db.add(marker)
    await db.commit()
    await db.refresh(marker)
    return marker


@router.get("/{athlete_id}/zones", response_model=HRZonesResponse)
async def get_zones(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_accessible_profile(athlete_id, db, current_user)
    try:
        return await calculate_hr_zones(athlete_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/{athlete_id}/history", response_model=list[WorkoutHistoryItem])
async def get_workout_history(
    athlete_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_accessible_profile(athlete_id, db, current_user)

    today = date.today()
    d_to   = date_to   or today
    d_from = date_from or (d_to - timedelta(days=29))

    workouts_result = await db.execute(
        select(IndividualWorkout)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.status == "completed",
            IndividualWorkout.planned_date >= d_from,
            IndividualWorkout.planned_date <= d_to,
        )
        .order_by(IndividualWorkout.planned_date.desc())
    )
    workouts = workouts_result.scalars().all()
    if not workouts:
        return []

    workout_ids = [w.id for w in workouts]
    telemetry_result = await db.execute(
        select(ActualTelemetry).where(ActualTelemetry.workout_id.in_(workout_ids))
    )
    telemetry_map = {t.workout_id: t for t in telemetry_result.scalars().all()}

    items = []
    for w in workouts:
        t = telemetry_map.get(w.id)
        items.append(WorkoutHistoryItem(
            id=w.id,
            planned_date=w.planned_date,
            workout_type=w.workout_type,
            workout_subtype=w.workout_subtype,
            description=w.description,
            planned_duration_min=w.planned_duration_min,
            planned_tss=float(w.planned_tss) if w.planned_tss is not None else None,
            actual_duration_min=t.actual_duration_min if t else None,
            actual_tss=float(t.actual_tss) if (t and t.actual_tss is not None) else None,
            actual_distance_km=float(t.distance_km) if (t and t.distance_km is not None) else None,
            avg_hr=t.avg_hr if t else None,
            max_hr=t.max_hr if t else None,
            hr_zone1_min=t.hr_zone1_min if t else None,
            hr_zone2_min=t.hr_zone2_min if t else None,
            hr_zone3_min=t.hr_zone3_min if t else None,
            hr_zone4_min=t.hr_zone4_min if t else None,
            hr_zone5_min=t.hr_zone5_min if t else None,
            target_zone=w.target_zone,
            status=w.status,
            interval_structure=w.interval_structure,
        ))
    return items


@router.get("/{athlete_id}/upcoming", response_model=list[IndividualWorkoutRead])
async def get_upcoming(
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_accessible_profile(athlete_id, db, current_user)
    today = date.today()
    result = await db.execute(
        select(IndividualWorkout)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.status.in_(["draft", "published"]),
            IndividualWorkout.planned_date >= today,
        )
        .order_by(IndividualWorkout.planned_date)
    )
    workouts = result.scalars().all()
    # Дедупликация: самая свежая запись на дату
    seen: dict = {}
    for w in workouts:
        if w.planned_date not in seen:
            seen[w.planned_date] = w
    return list(seen.values())
