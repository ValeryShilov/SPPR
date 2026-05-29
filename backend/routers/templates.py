import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.auth import get_current_user, require_coach
from backend.core.database import get_db
from backend.models.alerts import DiagnosticAlert
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.telemetry import ActualTelemetry
from backend.models.user import User
from backend.schemas.plan import (
    AdaptTaskResponse,
    MatrixWorkout,
    PlanTemplateCreate,
    PlanTemplateRead,
    PlanTemplateSummary,
    PlanTemplateUpdate,
)
from backend.tasks.planning import adapt_template_task

router = APIRouter()


async def _get_owned_template(
    template_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> PlanTemplate:
    tmpl = await db.get(PlanTemplate, template_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

    if current_user.role == "admin":
        return tmpl

    group = await db.get(TrainingGroup, tmpl.group_id)
    if group is None or group.coach_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    return tmpl


@router.get("", response_model=list[PlanTemplateSummary])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        tmpl_result = await db.execute(select(PlanTemplate))
    elif current_user.role == "coach":
        tmpl_result = await db.execute(
            select(PlanTemplate)
            .join(TrainingGroup, PlanTemplate.group_id == TrainingGroup.id)
            .where(TrainingGroup.coach_user_id == current_user.id)
        )
    else:
        athlete_profile = current_user.athlete_profile
        if athlete_profile is None:
            return []
        tmpl_result = await db.execute(
            select(PlanTemplate)
            .join(GroupMembership, PlanTemplate.group_id == GroupMembership.group_id)
            .where(
                GroupMembership.athlete_id == athlete_profile.id,
                GroupMembership.is_active.is_(True),
            )
        )

    templates = tmpl_result.scalars().all()
    if not templates:
        return []

    template_ids = [t.id for t in templates]
    group_ids = list({t.group_id for t in templates})

    groups_result = await db.execute(
        select(TrainingGroup.id, TrainingGroup.name).where(TrainingGroup.id.in_(group_ids))
    )
    group_names: dict[uuid.UUID, str] = {row.id: row.name for row in groups_result.all()}

    counts_result = await db.execute(
        select(
            IndividualWorkout.template_id,
            func.count(IndividualWorkout.id).label("total"),
            func.coalesce(
                func.sum(case((IndividualWorkout.status == "draft", 1), else_=0)), 0
            ).label("draft"),
            func.coalesce(
                func.sum(case((IndividualWorkout.status == "published", 1), else_=0)), 0
            ).label("published"),
        )
        .where(IndividualWorkout.template_id.in_(template_ids))
        .group_by(IndividualWorkout.template_id)
    )
    counts_map = {row.template_id: row for row in counts_result.all()}

    return [
        PlanTemplateSummary(
            id=t.id,
            group_id=t.group_id,
            group_name=group_names.get(t.group_id, ""),
            name=t.name,
            start_date=t.start_date,
            duration_days=t.duration_days,
            target_intensity_pct=t.target_intensity_pct,
            description=t.description,
            total_workouts=counts_map[t.id].total if t.id in counts_map else 0,
            draft_count=int(counts_map[t.id].draft) if t.id in counts_map else 0,
            published_count=int(counts_map[t.id].published) if t.id in counts_map else 0,
        )
        for t in templates
    ]


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


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    tmpl = await _get_owned_template(template_id, db, current_user)

    wids_result = await db.execute(
        select(IndividualWorkout.id).where(IndividualWorkout.template_id == template_id)
    )
    wids = wids_result.scalars().all()

    if wids:
        await db.execute(
            delete(DiagnosticAlert).where(DiagnosticAlert.triggered_by_workout_id.in_(wids))
        )
        await db.execute(
            delete(ActualTelemetry).where(ActualTelemetry.workout_id.in_(wids))
        )
        await db.execute(
            delete(IndividualWorkout).where(IndividualWorkout.template_id == template_id)
        )

    await db.delete(tmpl)
    await db.commit()


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


@router.get("/{template_id}/matrix", response_model=list[MatrixWorkout])
async def get_matrix(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tmpl = await db.get(PlanTemplate, template_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

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
        .options(selectinload(IndividualWorkout.athlete))
        .where(IndividualWorkout.template_id == template_id)
        .order_by(IndividualWorkout.athlete_id, IndividualWorkout.planned_date)
    )
    workouts = result.scalars().all()

    return [
        MatrixWorkout(
            id=w.id,
            athlete_id=w.athlete_id,
            athlete_first_name=w.athlete.first_name,
            athlete_last_name=w.athlete.last_name,
            planned_date=w.planned_date,
            planned_duration_min=w.planned_duration_min,
            planned_tss=w.planned_tss,
            k_qual=w.k_qual,
            k_form=w.k_form,
            target_zone=w.target_zone,
            workout_type=w.workout_type,
            workout_subtype=w.workout_subtype,
            description=w.description,
            interval_structure=w.interval_structure,
            status=w.status,
        )
        for w in workouts
    ]


@router.post("/{template_id}/approve-all", status_code=200)
async def approve_all(
    template_id: uuid.UUID,
    week_start: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_coach),
):
    await _get_owned_template(template_id, db, current_user)

    conditions = [
        IndividualWorkout.template_id == template_id,
        IndividualWorkout.status == "draft",
    ]
    if week_start is not None:
        week_end = week_start + timedelta(days=6)
        conditions.append(IndividualWorkout.planned_date >= week_start)
        conditions.append(IndividualWorkout.planned_date <= week_end)

    await db.execute(
        update(IndividualWorkout)
        .where(and_(*conditions))
        .values(status="published")
    )
    await db.commit()
    return {"detail": "Черновики утверждены"}
