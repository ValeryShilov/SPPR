import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, Float, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class AlertSettings(Base):
    """Singleton-таблица порогов диагностических алертов.

    Хранится ровно одна строка (id = 1). Если строки нет — используются
    умолчания из backend/core/config.py.
    """
    __tablename__ = "alert_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # ── Перегрузка ──────────────────────────────────────────────────────────
    p1_tsb_threshold:    Mapped[float] = mapped_column(Float, default=-30.0,  nullable=False)  # П1
    p2_resting_hr_pct:   Mapped[float] = mapped_column(Float, default=7.0,    nullable=False)  # П2
    p3_hrv_pct:          Mapped[float] = mapped_column(Float, default=85.0,   nullable=False)  # П3
    p5_z45_pct:          Mapped[float] = mapped_column(Float, default=20.0,   nullable=False)  # П5

    # ── Недогруз ────────────────────────────────────────────────────────────
    h1_ctl_delta:        Mapped[float] = mapped_column(Float, default=2.0,    nullable=False)  # Н1
    h2_tsb_high:         Mapped[float] = mapped_column(Float, default=15.0,   nullable=False)  # Н2
    h3_tss_pct:          Mapped[float] = mapped_column(Float, default=50.0,   nullable=False)  # Н3
    h5_z12_pct:          Mapped[float] = mapped_column(Float, default=75.0,   nullable=False)  # Н5

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
