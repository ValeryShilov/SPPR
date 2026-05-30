import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile, PhysiologicalMarker
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.user import User
from backend.schemas.athlete import PhysiologicalMarkerRead, PhysiologicalMarkerUpdate

router = APIRouter()


async def _get_accessible_marker(
    marker_id: uuid.UUID, db: AsyncSession, current_user: User
) -> PhysiologicalMarker:
    marker = await db.get(PhysiologicalMarker, marker_id)
    if not marker:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Маркер не найден")

    if current_user.role == "admin":
        return marker

    profile = await db.get(AthleteProfile, marker.athlete_id)
    if profile and profile.user_id == current_user.id:
        return marker

    if current_user.role == "coach":
        # .limit(1).first(): атлет может состоять в нескольких группах тренера.
        result = await db.execute(
            select(GroupMembership.id)
            .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
            .where(
                GroupMembership.athlete_id == marker.athlete_id,
                GroupMembership.is_active == True,
                TrainingGroup.coach_user_id == current_user.id,
            )
            .limit(1)
        )
        if result.first():
            return marker

    raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к маркеру")


@router.get("/{marker_id}", response_model=PhysiologicalMarkerRead)
async def get_marker(
    marker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_accessible_marker(marker_id, db, current_user)


@router.put("/{marker_id}", response_model=PhysiologicalMarkerRead)
async def update_marker(
    marker_id: uuid.UUID,
    data: PhysiologicalMarkerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    marker = await _get_accessible_marker(marker_id, db, current_user)

    if current_user.role == "athlete":
        profile = await db.get(AthleteProfile, marker.athlete_id)
        if not profile or profile.user_id != current_user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Нельзя редактировать чужой маркер")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(marker, field, value)
    await db.commit()
    await db.refresh(marker)
    return marker


@router.delete("/{marker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_marker(
    marker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    marker = await _get_accessible_marker(marker_id, db, current_user)

    if current_user.role == "athlete":
        profile = await db.get(AthleteProfile, marker.athlete_id)
        if not profile or profile.user_id != current_user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Нельзя удалить чужой маркер")

    await db.delete(marker)
    await db.commit()
