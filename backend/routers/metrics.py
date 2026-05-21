from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.schemas.telemetry import SubjectiveMetricCreate, SubjectiveMetricRead

router = APIRouter()


@router.post("", response_model=SubjectiveMetricRead, status_code=201)
async def create_metric(
    data: SubjectiveMetricCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: сохранить субъективные метрики, запустить generate_alerts
    pass


@router.get("/today", response_model=SubjectiveMetricRead | None)
async def get_today_metric(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: метрики за сегодня для текущего спортсмена
    pass
