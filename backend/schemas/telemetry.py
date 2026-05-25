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
    hr_zone1_min: int | None = None
    hr_zone2_min: int | None = None
    hr_zone3_min: int | None = None
    hr_zone4_min: int | None = None
    hr_zone5_min: int | None = None
    rpe: int | None = None
    comment: str | None = None
    timeseries: list | None = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class ActualTelemetryNotesUpdate(BaseModel):
    rpe: int | None = None
    comment: str | None = None


class ActualTelemetryManualCreate(BaseModel):
    workout_id: uuid.UUID
    actual_duration_min: int | None = None
    distance_km: Decimal | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    hr_zone1_min: int | None = None
    hr_zone2_min: int | None = None
    hr_zone3_min: int | None = None
    hr_zone4_min: int | None = None
    hr_zone5_min: int | None = None
    rpe: int | None = None
    comment: str | None = None


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
