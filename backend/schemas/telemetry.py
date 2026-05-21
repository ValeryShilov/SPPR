import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class ActualTelemetryRead(BaseModel):
    id: uuid.UUID
    workout_id: uuid.UUID
    source: str
    actual_duration_min: int | None
    distance_km: Decimal | None
    avg_hr: int | None
    max_hr: int | None
    actual_tss: Decimal | None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class TelemetryUploadResponse(BaseModel):
    task_id: str
    message: str


class TelemetryTaskStatus(BaseModel):
    task_id: str
    status: str
    result: dict | None = None


class SubjectiveMetricRead(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    date_recorded: date
    sleep_quality: int | None
    sleep_hours: Decimal | None
    fatigue_level: int | None
    hrv_value: int | None

    model_config = {"from_attributes": True}


class SubjectiveMetricCreate(BaseModel):
    date_recorded: date | None = None
    sleep_quality: int | None = None
    sleep_hours: Decimal | None = None
    fatigue_level: int | None = None
    hrv_value: int | None = None
