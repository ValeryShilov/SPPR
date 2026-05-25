import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    DATE,
    TIMESTAMP,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Enum as SAEnum,
    ForeignKey,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    birth_date: Mapped[date] = mapped_column(DATE, nullable=False)
    gender: Mapped[str] = mapped_column(SAEnum("m", "f", name="gender_enum"), nullable=False)
    qualification: Mapped[str | None] = mapped_column(String(50))
    coach_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    training_goal_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_event_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_event_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="athlete_profile", foreign_keys="AthleteProfile.user_id")
    group_memberships: Mapped[list["GroupMembership"]] = relationship(back_populates="athlete")
    physiological_markers: Mapped[list["PhysiologicalMarker"]] = relationship(back_populates="athlete")
    individual_workouts: Mapped[list["IndividualWorkout"]] = relationship(back_populates="athlete")
    subjective_metrics: Mapped[list["SubjectiveMetric"]] = relationship(back_populates="athlete")
    training_load_history: Mapped[list["TrainingLoadHistory"]] = relationship(back_populates="athlete")
    diagnostic_alerts: Mapped[list["DiagnosticAlert"]] = relationship(back_populates="athlete")


class PhysiologicalMarker(Base):
    __tablename__ = "physiological_markers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    date_recorded: Mapped[date] = mapped_column(DATE, nullable=False)
    resting_hr: Mapped[int | None] = mapped_column(Integer)
    max_hr: Mapped[int | None] = mapped_column(Integer)
    threshold_hr: Mapped[int | None] = mapped_column(Integer)
    hrv_baseline: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(
        SAEnum("measured", "formula", name="marker_source"), nullable=False, default="measured"
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    athlete: Mapped["AthleteProfile"] = relationship(back_populates="physiological_markers")
    individual_workouts: Mapped[list["IndividualWorkout"]] = relationship(back_populates="marker_used")


class SubjectiveMetric(Base):
    __tablename__ = "subjective_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    date_recorded: Mapped[date] = mapped_column(DATE, nullable=False)
    sleep_quality: Mapped[int | None] = mapped_column(Integer)
    sleep_hours: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    fatigue_level: Mapped[int | None] = mapped_column(Integer)
    hrv_value: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    athlete: Mapped["AthleteProfile"] = relationship(back_populates="subjective_metrics")
    diagnostic_alerts: Mapped[list["DiagnosticAlert"]] = relationship(
        back_populates="triggered_by_subjective"
    )

    __table_args__ = (UniqueConstraint("athlete_id", "date_recorded"),)


class TrainingLoadHistory(Base):
    __tablename__ = "training_load_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(DATE, nullable=False)
    daily_tss: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    atl_7d: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    ctl_42d: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    tsb: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    athlete: Mapped["AthleteProfile"] = relationship(back_populates="training_load_history")

    __table_args__ = (UniqueConstraint("athlete_id", "date"),)
