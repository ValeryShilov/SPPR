import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class PlanTemplateRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    name: str
    start_date: date
    duration_days: int
    target_intensity_pct: Decimal | None
    description: str | None

    model_config = {"from_attributes": True}


class PlanTemplateCreate(BaseModel):
    group_id: uuid.UUID
    name: str
    start_date: date
    duration_days: int
    target_intensity_pct: Decimal | None = None
    description: str | None = None


class PlanTemplateUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    duration_days: int | None = None
    target_intensity_pct: Decimal | None = None
    description: str | None = None


class IndividualWorkoutRead(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    athlete_id: uuid.UUID
    marker_id_used: uuid.UUID | None
    planned_date: date
    planned_duration_min: int | None
    planned_tss: Decimal | None
    target_zone: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IndividualWorkoutUpdate(BaseModel):
    planned_date: date | None = None
    planned_duration_min: int | None = None
    planned_tss: Decimal | None = None
    target_zone: str | None = None


class AdaptTaskResponse(BaseModel):
    task_id: str
    message: str
