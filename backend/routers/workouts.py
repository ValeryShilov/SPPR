import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user, require_coach
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.user import User
from backend.schemas.plan import IndividualWorkoutCreate, IndividualWorkoutRead, IndividualWorkoutUpdate, SelfWorkoutCreate

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
        if workout.template_id is not None:
            tmpl = await db.get(PlanTemplate, workout.template_id)
            group = await db.get(TrainingGroup, tmpl.group_id) if tmpl else None
            if group is None or group.coach_user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        else:
            # Тренировка создана вручную — проверяем, что атлет входит в группу тренера
            result = await db.execute(
                select(GroupMembership)
                .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
                .where(
                    GroupMembership.athlete_id == workout.athlete_id,
                    GroupMembership.is_active == True,
                    TrainingGroup.coach_user_id == current_user.id,
                )
            )
            if result.scalar_one_or_none() is None:
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


@router.post("/self", response_model=IndividualWorkoutRead, status_code=status.HTTP_201_CREATED)
async def create_self_workout(
    data: SelfWorkoutCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Атлет самостоятельно регистрирует тренировку вне плана."""
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль атлета не найден")

    workout = IndividualWorkout(
        template_id=None,
        marker_id_used=None,
        k_qual=None,
        k_form=None,
        athlete_id=athlete.id,
        planned_date=data.planned_date,
        workout_type=data.workout_type,
        workout_subtype=data.workout_subtype,
        target_zone=None,
        planned_duration_min=None,
        planned_tss=None,
        description=None,
        interval_structure=None,
        status="completed",
    )
    db.add(workout)
    await db.commit()
    await db.refresh(workout)
    return workout


@router.post("", response_model=IndividualWorkoutRead, status_code=status.HTTP_201_CREATED)
async def create_workout(
    data: IndividualWorkoutCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    """Создание индивидуальной тренировки тренером для атлета из его группы."""
    # Проверяем, что атлет существует
    athlete = await db.get(AthleteProfile, data.athlete_id)
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Атлет не найден")

    # Проверяем, что атлет входит в группу данного тренера
    result = await db.execute(
        select(GroupMembership)
        .join(TrainingGroup, GroupMembership.group_id == TrainingGroup.id)
        .where(
            GroupMembership.athlete_id == data.athlete_id,
            GroupMembership.is_active == True,
            TrainingGroup.coach_user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Атлет не входит в группу тренера")

    workout = IndividualWorkout(
        template_id=None,
        marker_id_used=None,
        k_qual=None,
        k_form=None,
        athlete_id=data.athlete_id,
        planned_date=data.planned_date,
        workout_type=data.workout_type,
        workout_subtype=data.workout_subtype,
        target_zone=data.target_zone,
        planned_duration_min=data.planned_duration_min,
        planned_tss=data.planned_tss,
        description=data.description,
        interval_structure=data.interval_structure,
        status=data.status,
    )
    db.add(workout)
    await db.commit()
    await db.refresh(workout)
    return workout


@router.delete("/self/{workout_id}", status_code=status.HTTP_200_OK)
async def delete_self_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Атлет удаляет собственную тренировку вне плана (template_id is None)."""
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль атлета не найден")

    workout = await db.get(IndividualWorkout, workout_id)
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")

    if workout.athlete_id != athlete.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    await db.delete(workout)
    await db.commit()
    return {"detail": "ok"}


@router.delete("/{workout_id}", status_code=status.HTTP_200_OK)
async def delete_workout(
    workout_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    """Удаление тренировки тренером (только не завершённые)."""
    workout = await _get_accessible_workout(workout_id, db, current_user)

    if workout.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить завершённую тренировку",
        )

    await db.delete(workout)
    await db.commit()
    return {"detail": "ok"}
