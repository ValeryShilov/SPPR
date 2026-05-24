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


class GroupWeekWorkout(BaseModel):
    id: uuid.UUID
    planned_date: date
    workout_type: str | None
    workout_subtype: str | None
    target_zone: str | None
    planned_duration_min: int | None
    planned_tss: Decimal | None
    actual_tss: Decimal | None
    actual_duration_min: int | None
    distance_km: Decimal | None
    avg_hr: int | None
    max_hr: int | None
    hr_zone1_min: int | None
    hr_zone2_min: int | None
    hr_zone3_min: int | None
    hr_zone4_min: int | None
    hr_zone5_min: int | None
    status: str
    description: str | None
    interval_structure: list | None

    model_config = {"from_attributes": True}


class GroupWeekAthlete(BaseModel):
    athlete_id: uuid.UUID
    full_name: str
    tsb: float | None
    atl: float | None
    ctl: float | None
    alert_severity: str | None
    workouts: list[GroupWeekWorkout]


class VolumeByType(BaseModel):
    workout_type: str
    total_duration_min: int
    total_distance_km: float | None
    sessions: int


class VolumeWeekEntry(BaseModel):
    workout_type: str
    duration_min: int
    distance_km: float | None


class VolumeWeekPoint(BaseModel):
    week_start: date
    entries: list[VolumeWeekEntry]


class VolumeResponse(BaseModel):
    athlete_id: uuid.UUID
    by_type: list[VolumeByType]
    weekly: list[VolumeWeekPoint]
    daily: list[VolumeWeekPoint]


class CoachAthleteGroup(BaseModel):
    id: uuid.UUID
    name: str


class CoachAthlete(BaseModel):
    athlete_id: uuid.UUID
    full_name: str
    groups: list[CoachAthleteGroup]
    tsb: float | None
    atl: float | None
    ctl: float | None
    active_alerts: int
    alert_severity: str | None
    last_workout_status: str | None
