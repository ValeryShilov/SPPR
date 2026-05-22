import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AthleteProfileRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    last_name: str
    birth_date: date
    gender: str
    qualification: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AthleteProfileCreate(BaseModel):
    first_name: str
    last_name: str
    birth_date: date
    gender: str  # "m" | "f"
    qualification: str | None = None


class AthleteProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    qualification: str | None = None


class PhysiologicalMarkerRead(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    date_recorded: date
    resting_hr: int | None
    max_hr: int | None
    threshold_hr: int | None
    hrv_baseline: int | None
    source: str
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PhysiologicalMarkerCreate(BaseModel):
    date_recorded: date
    resting_hr: int | None = None
    max_hr: int | None = None
    threshold_hr: int | None = None
    hrv_baseline: int | None = None
    source: str = "measured"
    notes: str | None = None


class PhysiologicalMarkerUpdate(BaseModel):
    date_recorded: date | None = None
    resting_hr: int | None = None
    max_hr: int | None = None
    threshold_hr: int | None = None
    hrv_baseline: int | None = None
    source: str | None = None
    notes: str | None = None


class HRZone(BaseModel):
    zone: str
    label: str
    hr_min: int
    hr_max: int


class HRZonesResponse(BaseModel):
    athlete_id: uuid.UUID
    max_hr: int
    source: str
    zones: list[HRZone]


class WorkoutHistoryItem(BaseModel):
    id: uuid.UUID
    planned_date: date
    planned_duration_min: int | None
    planned_tss: float | None
    actual_duration_min: int | None
    actual_tss: float | None
    target_zone: str | None
    status: str
