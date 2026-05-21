import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.schemas.plan import (
    AdaptTaskResponse,
    IndividualWorkoutRead,
    PlanTemplateCreate,
    PlanTemplateRead,
    PlanTemplateUpdate,
)

router = APIRouter()


@router.get("", response_model=list[PlanTemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: список шаблонов
    pass


@router.post("", response_model=PlanTemplateRead, status_code=201)
async def create_template(
    data: PlanTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: создать шаблон
    pass


@router.get("/{template_id}", response_model=PlanTemplateRead)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: получить шаблон
    pass


@router.put("/{template_id}", response_model=PlanTemplateRead)
async def update_template(
    template_id: uuid.UUID,
    data: PlanTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: обновить шаблон
    pass


@router.post("/{template_id}/adapt", response_model=AdaptTaskResponse)
async def adapt_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: запустить Celery-задачу адаптации → вернуть task_id
    pass


@router.get("/{template_id}/matrix", response_model=list[IndividualWorkoutRead])
async def get_matrix(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: расчётная матрица черновиков
    pass


@router.post("/{template_id}/approve-all")
async def approve_all(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: утвердить все черновики → published
    pass
