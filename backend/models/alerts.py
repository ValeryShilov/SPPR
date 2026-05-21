import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, Boolean, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class DiagnosticAlert(Base):
    __tablename__ = "diagnostic_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athlete_profiles.id"), nullable=False
    )
    triggered_by_workout_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_workouts.id")
    )
    triggered_by_subjective_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjective_metrics.id")
    )
    severity: Mapped[str] = mapped_column(
        SAEnum("info", "warning", "critical", name="alert_severity"), nullable=False
    )
    rule_code: Mapped[str] = mapped_column(String(10), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    athlete: Mapped["AthleteProfile"] = relationship(back_populates="diagnostic_alerts")
    triggered_by_workout: Mapped["IndividualWorkout | None"] = relationship(
        back_populates="diagnostic_alerts"
    )
    triggered_by_subjective: Mapped["SubjectiveMetric | None"] = relationship(
        back_populates="diagnostic_alerts"
    )
