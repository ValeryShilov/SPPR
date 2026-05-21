import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import TIMESTAMP, Enum as SAEnum, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class ActualTelemetry(Base):
    __tablename__ = "actual_telemetry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workout_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("individual_workouts.id"), unique=True, nullable=False
    )
    source: Mapped[str] = mapped_column(
        SAEnum("imported", "manual", name="telemetry_source"), nullable=False
    )
    actual_duration_min: Mapped[int | None] = mapped_column(Integer)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    avg_hr: Mapped[int | None] = mapped_column(Integer)
    max_hr: Mapped[int | None] = mapped_column(Integer)
    actual_tss: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    hr_zone1_min: Mapped[int | None] = mapped_column(Integer)
    hr_zone2_min: Mapped[int | None] = mapped_column(Integer)
    hr_zone3_min: Mapped[int | None] = mapped_column(Integer)
    hr_zone4_min: Mapped[int | None] = mapped_column(Integer)
    hr_zone5_min: Mapped[int | None] = mapped_column(Integer)
    raw_file_path: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    workout: Mapped["IndividualWorkout"] = relationship(back_populates="actual_telemetry")
