import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.schemas.plan import IndividualWorkoutRead, IndividualWorkoutUpdate

router = APIRouter()


@router.get("/{workout_id}", response_model=IndividualWorkoutRead)
async def get_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: получить тренировку
    pass


@router.put("/{workout_id}", response_model=IndividualWorkoutRead)
async def update_workout(
    workout_id: uuid.UUID,
    data: IndividualWorkoutUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: ручное редактирование тренером
    pass


@router.post("/{workout_id}/approve", response_model=IndividualWorkoutRead)
async def approve_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: draft → published
    pass
