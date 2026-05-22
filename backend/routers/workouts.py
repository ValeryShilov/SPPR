import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user, require_coach
from backend.core.database import get_db
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.user import User
from backend.schemas.plan import IndividualWorkoutRead, IndividualWorkoutUpdate

router = APIRouter()


async def _get_accessible_workout(
    workout_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> IndividualWorkout:
    """Возвращает тренировку, если у пользователя есть права на её просмотр."""
    workout = await db.get(IndividualWorkout, workout_id)
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")

    if current_user.role == "admin":
        return workout

    if current_user.role == "coach":
        tmpl = await db.get(PlanTemplate, workout.template_id)
        group = await db.get(TrainingGroup, tmpl.group_id) if tmpl else None
        if group is None or group.coach_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return workout

    # athlete — только своя тренировка
    athlete_profile = current_user.athlete_profile
    if athlete_profile is None or workout.athlete_id != athlete_profile.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return workout


@router.get("/{workout_id}", response_model=IndividualWorkoutRead)
async def get_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_accessible_workout(workout_id, db, current_user)


@router.put("/{workout_id}", response_model=IndividualWorkoutRead)
async def update_workout(
    workout_id: uuid.UUID,
    data: IndividualWorkoutUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    workout = await _get_accessible_workout(workout_id, db, current_user)

    if workout.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя редактировать завершённую тренировку",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(workout, field, value)

    await db.commit()
    await db.refresh(workout)
    return workout


@router.post("/{workout_id}/approve", response_model=IndividualWorkoutRead)
async def approve_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    workout = await _get_accessible_workout(workout_id, db, current_user)

    if workout.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Тренировка уже имеет статус '{workout.status}', ожидается 'draft'",
        )

    workout.status = "published"
    await db.commit()
    await db.refresh(workout)
    return workout
