import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user, require_role
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import PlanTemplate
from backend.models.user import User
from backend.schemas.group import (
    AddMemberRequest,
    GroupMembershipRead,
    TrainingGroupCreate,
    TrainingGroupRead,
    TrainingGroupUpdate,
)

router = APIRouter()


async def _get_owned_group(
    group_id: uuid.UUID, db: AsyncSession, current_user: User
) -> TrainingGroup:
    group = await db.get(TrainingGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Группа не найдена")
    if current_user.role != "admin" and group.coach_user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этой группе")
    return group


# ── Список групп ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[TrainingGroupRead])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        result = await db.execute(select(TrainingGroup).order_by(TrainingGroup.created_at.desc()))
        return result.scalars().all()

    if current_user.role == "coach":
        result = await db.execute(
            select(TrainingGroup)
            .where(TrainingGroup.coach_user_id == current_user.id)
            .order_by(TrainingGroup.created_at.desc())
        )
        return result.scalars().all()

    # athlete — группы, в которых состоит
    ap = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = ap.scalar_one_or_none()
    if not profile:
        return []
    result = await db.execute(
        select(TrainingGroup)
        .join(GroupMembership, GroupMembership.group_id == TrainingGroup.id)
        .where(GroupMembership.athlete_id == profile.id, GroupMembership.is_active == True)
        .order_by(TrainingGroup.name)
    )
    return result.scalars().all()


# ── Создание группы ───────────────────────────────────────────────────────────

@router.post("", response_model=TrainingGroupRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("coach", "admin"))])
async def create_group(
    data: TrainingGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = TrainingGroup(coach_user_id=current_user.id, **data.model_dump())
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


# ── Получение / изменение / удаление группы ──────────────────────────────────

@router.get("/{group_id}", response_model=TrainingGroupRead)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(TrainingGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Группа не найдена")
    return group


@router.put("/{group_id}", response_model=TrainingGroupRead)
async def update_group(
    group_id: uuid.UUID,
    data: TrainingGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await _get_owned_group(group_id, db, current_user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await _get_owned_group(group_id, db, current_user)

    # Шаблоны, привязанные к группе, остаются в системе без группы
    await db.execute(
        update(PlanTemplate)
        .where(PlanTemplate.group_id == group_id)
        .values(group_id=None)
    )

    await db.delete(group)
    await db.commit()


# ── Состав группы ─────────────────────────────────────────────────────────────

@router.get("/{group_id}/members", response_model=list[GroupMembershipRead])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await db.get(TrainingGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Группа не найдена")
    result = await db.execute(
        select(GroupMembership)
        .where(GroupMembership.group_id == group_id, GroupMembership.is_active == True)
        .order_by(GroupMembership.joined_at)
    )
    return result.scalars().all()


@router.post("/{group_id}/members", response_model=GroupMembershipRead,
             status_code=status.HTTP_201_CREATED)
async def add_member(
    group_id: uuid.UUID,
    data: AddMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_group(group_id, db, current_user)

    profile = await db.get(AthleteProfile, data.athlete_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Профиль атлета не найден")

    existing = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.athlete_id == data.athlete_id,
            GroupMembership.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Атлет уже состоит в группе")

    member = GroupMembership(
        group_id=group_id,
        athlete_id=data.athlete_id,
        joined_at=data.joined_at or date.today(),
        is_active=True,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{group_id}/members/{athlete_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    athlete_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_group(group_id, db, current_user)

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.athlete_id == athlete_id,
            GroupMembership.is_active == True,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Участник не найден в группе")

    member.is_active = False
    await db.commit()
