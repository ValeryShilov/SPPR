import uuid
from datetime import date
from pathlib import Path

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user, require_athlete
from backend.core.celery_app import celery_app
from backend.core.database import get_db
from backend.models.athlete import AthleteProfile
from backend.models.plan import IndividualWorkout
from backend.models.user import User
from backend.schemas.plan import IndividualWorkoutRead
from backend.schemas.telemetry import TelemetryTaskStatus, TelemetryUploadResponse
from backend.tasks.telemetry import parse_telemetry_file

router = APIRouter()

_UPLOAD_DIR = Path("/tmp/sppr_uploads")
_ALLOWED_FORMATS = {"fit", "gpx", "tcx", "csv"}


async def _get_profile(user_id: uuid.UUID, db: AsyncSession) -> AthleteProfile:
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль спортсмена не найден",
        )
    return profile


@router.get("/my-plan", response_model=list[IndividualWorkoutRead])
async def get_my_plan(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_athlete),
):
    profile = await _get_profile(current_user.id, db)

    result = await db.execute(
        select(IndividualWorkout)
        .where(
            IndividualWorkout.athlete_id == profile.id,
            IndividualWorkout.status == "published",
            IndividualWorkout.planned_date >= date.today(),
        )
        .order_by(IndividualWorkout.planned_date)
    )
    return result.scalars().all()


@router.post("/telemetry/upload", response_model=TelemetryUploadResponse, status_code=202)
async def upload_telemetry(
    workout_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_athlete),
):
    # Проверяем формат файла
    filename = file.filename or ""
    fmt = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if fmt not in _ALLOWED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неподдерживаемый формат. Допустимы: {', '.join(sorted(_ALLOWED_FORMATS))}",
        )

    profile = await _get_profile(current_user.id, db)

    workout = await db.get(IndividualWorkout, workout_id)
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    if workout.athlete_id != profile.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    # Сохраняем файл на диск
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{workout_id}_{uuid.uuid4().hex}.{fmt}"
    file_path = _UPLOAD_DIR / safe_name
    file_path.write_bytes(await file.read())

    # Ставим задачу в очередь Celery
    task = parse_telemetry_file.delay(str(workout_id), str(file_path), fmt)

    return TelemetryUploadResponse(
        task_id=task.id,
        message=f"Файл принят, обработка запущена (задача {task.id})",
    )


@router.get("/telemetry/status/{task_id}", response_model=TelemetryTaskStatus)
async def telemetry_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    result: AsyncResult = celery_app.AsyncResult(task_id)
    payload: dict | None = None

    if result.state == "SUCCESS":
        raw = result.result
        payload = raw if isinstance(raw, dict) else {"value": raw}
    elif result.state == "FAILURE":
        payload = {"error": str(result.result)}

    return TelemetryTaskStatus(
        task_id=task_id,
        status=result.state,
        result=payload,
    )
