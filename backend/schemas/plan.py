import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class SegmentConfig(BaseModel):
    seg_type: str           # warmup / work / rest_seg / cooldown
    zone: str               # Z1–Z5
    duration_min: int
    repeats: int = 1
    note: str | None = None


class WeekDayConfig(BaseModel):
    workout_type: str = "run"           # ski/skiroll/run/bike/strength/recovery/rest/other
    workout_subtype: str | None = None  # skate/classic/doublepoling (only ski/skiroll)
    zone: str = "Z2"                    # Z1–Z5 (cyclic only)
    duration_min: int = 60
    description: str | None = None
    interval_structure: list[SegmentConfig] | None = None


class PlanTemplateRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    name: str
    start_date: date
    duration_days: int
    target_intensity_pct: Decimal | None
    description: str | None
    week_schedule: list[Any] | None     # raw JSON — parsed on frontend

    model_config = {"from_attributes": True}


class PlanTemplateCreate(BaseModel):
    group_id: uuid.UUID
    name: str
    start_date: date
    duration_days: int
    target_intensity_pct: Decimal | None = None
    description: str | None = None
    week_schedule: list[WeekDayConfig] | None = None


class PlanTemplateUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    duration_days: int | None = None
    target_intensity_pct: Decimal | None = None
    description: str | None = None
    week_schedule: list[WeekDayConfig] | None = None


class IndividualWorkoutRead(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID | None
    athlete_id: uuid.UUID
    marker_id_used: uuid.UUID | None
    planned_date: date
    planned_duration_min: int | None
    planned_tss: Decimal | None
    k_qual: Decimal | None
    k_form: Decimal | None
    target_zone: str | None
    workout_type: str | None
    workout_subtype: str | None
    description: str | None
    interval_structure: list[Any] | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IndividualWorkoutUpdate(BaseModel):
    planned_date: date | None = None
    planned_duration_min: int | None = None
    planned_tss: Decimal | None = None
    target_zone: str | None = None
    workout_type: str | None = None
    workout_subtype: str | None = None
    description: str | None = None
    interval_structure: list[Any] | None = None


class IndividualWorkoutCreate(BaseModel):
    athlete_id: uuid.UUID
    planned_date: date
    workout_type: str | None = None
    workout_subtype: str | None = None
    target_zone: str | None = None
    planned_duration_min: int | None = None
    planned_tss: Decimal | None = None
    description: str | None = None
    interval_structure: list[Any] | None = None
    status: str = "published"


class AdaptTaskResponse(BaseModel):
    task_id: str
    message: str
