from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.schemas.telemetry import TelemetryTaskStatus, TelemetryUploadResponse

router = APIRouter()


@router.get("/my-plan")
async def get_my_plan(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: план спортсмена на текущую неделю
    pass


@router.post("/telemetry/upload", response_model=TelemetryUploadResponse)
async def upload_telemetry(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # TODO: сохранить файл, запустить Celery parse_telemetry_file
    pass


@router.get("/telemetry/status/{task_id}", response_model=TelemetryTaskStatus)
async def telemetry_status(
    task_id: str,
    current_user=Depends(get_current_user),
):
    # TODO: статус Celery-задачи
    pass
