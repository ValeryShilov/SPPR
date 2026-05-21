import uuid
from datetime import date, datetime

from pydantic import BaseModel


class TrainingGroupRead(BaseModel):
    id: uuid.UUID
    coach_user_id: uuid.UUID
    name: str
    description: str | None
    min_age: int | None
    max_age: int | None
    target_event: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainingGroupCreate(BaseModel):
    name: str
    description: str | None = None
    min_age: int | None = None
    max_age: int | None = None
    target_event: str | None = None


class TrainingGroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    min_age: int | None = None
    max_age: int | None = None
    target_event: str | None = None


class GroupMembershipRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    athlete_id: uuid.UUID
    joined_at: date
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AddMemberRequest(BaseModel):
    athlete_id: uuid.UUID
    joined_at: date | None = None
