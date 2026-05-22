import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user, require_coach
from backend.core.database import get_db
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.user import User
from backend.schemas.plan import (
    AdaptTaskResponse,
    IndividualWorkoutRead,
    PlanTemplateCreate,
    PlanTemplateRead,
    PlanTemplateUpdate,
)
from backend.tasks.planning import adapt_template_task

router = APIRouter()


async def _get_owned_template(
    template_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> PlanTemplate:
    """Возвращает шаблон, к которому у пользователя есть права тренера/admin."""
    tmpl = await db.get(PlanTemplate, template_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

    if current_user.role == "admin":
        return tmpl

    # coach — должен владеть группой
    group = await db.get(TrainingGroup, tmpl.group_id)
    if group is None or group.coach_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    return tmpl


@router.get("", response_model=list[PlanTemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        result = await db.execute(select(PlanTemplate))
        return result.scalars().all()

    if current_user.role == "coach":
        result = await db.execute(
            select(PlanTemplate)
            .join(TrainingGroup, PlanTemplate.group_id == TrainingGroup.id)
            .where(TrainingGroup.coach_user_id == current_user.id)
        )
        return result.scalars().all()

    # athlete — шаблоны групп, в которых состоит
    athlete_profile = current_user.athlete_profile
    if athlete_profile is None:
        return []

    result = await db.execute(
        select(PlanTemplate)
        .join(GroupMembership, PlanTemplate.group_id == GroupMembership.group_id)
        .where(
            GroupMembership.athlete_id == athlete_profile.id,
            GroupMembership.is_active.is_(True),
        )
    )
    return result.scalars().all()


@router.post("", response_model=PlanTemplateRead, status_code=201)
async def create_template(
    data: PlanTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    if current_user.role != "admin":
        group = await db.get(TrainingGroup, data.group_id)
        if group is None or group.coach_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Группа не принадлежит текущему тренеру",
            )

    tmpl = PlanTemplate(**data.model_dump())
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.get("/{template_id}", response_model=PlanTemplateRead)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tmpl = await db.get(PlanTemplate, template_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

    if current_user.role == "admin":
        return tmpl

    if current_user.role == "coach":
        group = await db.get(TrainingGroup, tmpl.group_id)
        if group is None or group.coach_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return tmpl

    # athlete
    athlete_profile = current_user.athlete_profile
    if athlete_profile is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == tmpl.group_id,
            GroupMembership.athlete_id == athlete_profile.id,
            GroupMembership.is_active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return tmpl


@router.put("/{template_id}", response_model=PlanTemplateRead)
async def update_template(
    template_id: uuid.UUID,
    data: PlanTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    tmpl = await _get_owned_template(template_id, db, current_user)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, field, value)

    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.post("/{template_id}/adapt", response_model=AdaptTaskResponse)
async def adapt_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    await _get_owned_template(template_id, db, current_user)

    task = adapt_template_task.delay(str(template_id))
    return AdaptTaskResponse(
        task_id=task.id,
        message=f"Адаптация шаблона {template_id} запущена",
    )


@router.get("/{template_id}/matrix", response_model=list[IndividualWorkoutRead])
async def get_matrix(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tmpl = await db.get(PlanTemplate, template_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

    # Проверка доступа: тренер-владелец, admin или спортсмен группы
    if current_user.role not in ("admin",):
        if current_user.role == "coach":
            group = await db.get(TrainingGroup, tmpl.group_id)
            if group is None or group.coach_user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        else:
            athlete_profile = current_user.athlete_profile
            if athlete_profile is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
            result = await db.execute(
                select(GroupMembership).where(
                    GroupMembership.group_id == tmpl.group_id,
                    GroupMembership.athlete_id == athlete_profile.id,
                    GroupMembership.is_active.is_(True),
                )
            )
            if result.scalar_one_or_none() is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    result = await db.execute(
        select(IndividualWorkout)
        .where(
            IndividualWorkout.template_id == template_id,
            IndividualWorkout.status == "draft",
        )
        .order_by(IndividualWorkout.athlete_id, IndividualWorkout.planned_date)
    )
    return result.scalars().all()


@router.post("/{template_id}/approve-all", status_code=200)
async def approve_all(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    await _get_owned_template(template_id, db, current_user)

    await db.execute(
        update(IndividualWorkout)
        .where(
            IndividualWorkout.template_id == template_id,
            IndividualWorkout.status == "draft",
        )
        .values(status="published")
    )
    await db.commit()
    return {"detail": "Все черновики утверждены"}
