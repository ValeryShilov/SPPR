import uuid
from datetime import date, datetime

from sqlalchemy import DATE, TIMESTAMP, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class TrainingGroup(Base):
    __tablename__ = "training_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    coach_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    min_age: Mapped[int | None] = mapped_column(Integer)
    max_age: Mapped[int | None] = mapped_column(Integer)
    target_event: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    coach: Mapped["User"] = relationship(back_populates="training_groups", foreign_keys=[coach_user_id])
    memberships: Mapped[list["GroupMembership"]] = relationship(back_populates="group")
    plan_templates: Mapped[list["PlanTemplate"]] = relationship(back_populates="group")


class GroupMembership(Base):
    __tablename__ = "group_memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_groups.id"), nullable=False
    )
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    joined_at: Mapped[date] = mapped_column(DATE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    group: Mapped["TrainingGroup"] = relationship(back_populates="memberships")
    athlete: Mapped["AthleteProfile"] = relationship(back_populates="group_memberships")

    __table_args__ = (UniqueConstraint("group_id", "athlete_id"),)
