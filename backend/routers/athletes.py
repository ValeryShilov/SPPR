import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile, PhysiologicalMarker
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.user import User
from backend.schemas.athlete import (
    AthleteProfileCreate,
    AthleteProfileRead,
    AthleteProfileUpdate,
    PhysiologicalMarkerCreate,
    PhysiologicalMarkerRead,
)

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
        result = await db.execute(
            select(GroupMembership)
            .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
            .where(
                GroupMembership.athlete_id == athlete_id,
                GroupMembership.is_active == True,
                TrainingGroup.coach_user_id == current_user.id,
            )
        )
        if result.scalar_one_or_none():
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
        # только атлеты из групп этого тренера
        result = await db.execute(
            select(AthleteProfile)
            .join(GroupMembership, GroupMembership.athlete_id == AthleteProfile.id)
            .join(TrainingGroup, TrainingGroup.id == GroupMembership.group_id)
            .where(
                TrainingGroup.coach_user_id == current_user.id,
                GroupMembership.is_active == True,
            )
            .distinct()
            .order_by(AthleteProfile.last_name)
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
