import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class LoadPoint(BaseModel):
    date: date
    daily_tss: Decimal
    atl_7d: Decimal
    ctl_42d: Decimal
    tsb: Decimal


class LoadResponse(BaseModel):
    athlete_id: uuid.UUID
    data: list[LoadPoint]


class PlanFactPoint(BaseModel):
    week_start: date
    planned_tss: Decimal
    actual_tss: Decimal


class PlanFactResponse(BaseModel):
    athlete_id: uuid.UUID
    data: list[PlanFactPoint]


class AlertRead(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    severity: str
    rule_code: str
    message: str
    is_resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupSummaryItem(BaseModel):
    athlete_id: uuid.UUID
    full_name: str
    active_alerts: int
    tsb: Decimal | None
    last_workout_status: str | None


class GroupSummaryResponse(BaseModel):
    group_id: uuid.UUID
    athletes: list[GroupSummaryItem]
