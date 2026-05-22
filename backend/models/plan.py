import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DATE, JSON, TIMESTAMP, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class PlanTemplate(Base):
    __tablename__ = "plan_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_groups.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(DATE, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    target_intensity_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    description: Mapped[str | None] = mapped_column(Text)
    week_schedule: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    group: Mapped["TrainingGroup"] = relationship(back_populates="plan_templates")
    individual_workouts: Mapped[list["IndividualWorkout"]] = relationship(back_populates="template")


class IndividualWorkout(Base):
    __tablename__ = "individual_workouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plan_templates.id"), nullable=False
    )
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    marker_id_used: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("physiological_markers.id")
    )
    planned_date: Mapped[date] = mapped_column(DATE, nullable=False)
    planned_duration_min: Mapped[int | None] = mapped_column(Integer)
    planned_tss: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    k_qual: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    k_form: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    target_zone: Mapped[str | None] = mapped_column(String(2))
    workout_type: Mapped[str | None] = mapped_column(String(50))
    workout_subtype: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    interval_structure: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum("draft", "published", "completed", name="workout_status"),
        nullable=False,
        default="draft",
    )
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    template: Mapped["PlanTemplate"] = relationship(back_populates="individual_workouts")
    athlete: Mapped["AthleteProfile"] = relationship(back_populates="individual_workouts")
    marker_used: Mapped["PhysiologicalMarker | None"] = relationship(back_populates="individual_workouts")
    actual_telemetry: Mapped["ActualTelemetry | None"] = relationship(
        back_populates="workout", uselist=False
    )
    diagnostic_alerts: Mapped[list["DiagnosticAlert"]] = relationship(
        back_populates="triggered_by_workout"
    )
