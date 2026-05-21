"""Фикстуры pytest для интеграционных тестов.

Использует транзакцию с откатом для изоляции каждого теста:
- session.commit заменяется на session.flush
- после теста вызывается session.rollback()

Подключение:
  Внутри Docker  — DATABASE_URL из окружения (хост 'postgres').
  Снаружи Docker — задать TEST_DATABASE_URL=postgresql+asyncpg://sppr:sppr@localhost:5432/sppr
"""
import os
import uuid
from datetime import date

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.models.athlete import AthleteProfile, TrainingLoadHistory
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.telemetry import ActualTelemetry
from backend.models.user import User

_base_url = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://sppr:sppr@postgres:5432/sppr"
)
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", _base_url)

_engine = create_async_engine(TEST_DB_URL, echo=False)


@pytest_asyncio.fixture
async def db():
    """Сессия SQLAlchemy с автоматическим откатом после каждого теста."""
    async with AsyncSession(_engine, expire_on_commit=False) as session:
        session.commit = session.flush  # предотвращает реальные коммиты
        yield session
        await session.rollback()


# ─── Вспомогательные фикстуры ───────────────────────────────────────────────


@pytest_asyncio.fixture
async def athlete_data(db):
    """(user, profile) — минимальный атлет для тестов зон ЧСС и индексов нагрузки."""
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"{uid}@test.example",
        password_hash="x",
        role="athlete",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    profile = AthleteProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        first_name="Тест",
        last_name="Атлет",
        birth_date=date(1990, 1, 1),
        gender="m",
    )
    db.add(profile)
    await db.flush()
    return user, profile


@pytest_asyncio.fixture
async def template_data(db):
    """(template, athlete_profile) — шаблон с одним активным участником."""
    from decimal import Decimal

    coach_uid = uuid.uuid4()
    coach = User(
        id=coach_uid,
        email=f"coach_{coach_uid}@test.example",
        password_hash="x",
        role="coach",
        is_active=True,
    )
    db.add(coach)

    ath_uid = uuid.uuid4()
    athlete_user = User(
        id=ath_uid,
        email=f"ath_{ath_uid}@test.example",
        password_hash="x",
        role="athlete",
        is_active=True,
    )
    db.add(athlete_user)
    await db.flush()

    profile = AthleteProfile(
        id=uuid.uuid4(),
        user_id=athlete_user.id,
        first_name="Анна",
        last_name="Бегова",
        birth_date=date(1995, 6, 15),
        gender="f",
    )
    db.add(profile)

    group = TrainingGroup(
        id=uuid.uuid4(),
        coach_user_id=coach.id,
        name="Тест группа",
    )
    db.add(group)
    await db.flush()

    membership = GroupMembership(
        id=uuid.uuid4(),
        group_id=group.id,
        athlete_id=profile.id,
        joined_at=date.today(),
        is_active=True,
    )
    db.add(membership)

    template = PlanTemplate(
        id=uuid.uuid4(),
        group_id=group.id,
        name="Базовый микроцикл",
        start_date=date.today(),
        duration_days=3,
        target_intensity_pct=Decimal("75.00"),
    )
    db.add(template)
    await db.flush()
    return template, profile


@pytest_asyncio.fixture
async def workout_data(db, athlete_data):
    """(workout, telemetry) — тренировка с телеметрией для тестов calculate_load_indexes."""
    _, profile = athlete_data

    coach_uid = uuid.uuid4()
    coach = User(
        id=coach_uid,
        email=f"coach_{coach_uid}@test.example",
        password_hash="x",
        role="coach",
        is_active=True,
    )
    db.add(coach)

    group = TrainingGroup(
        id=uuid.uuid4(),
        coach_user_id=coach.id,
        name="Группа для нагрузки",
    )
    db.add(group)
    await db.flush()

    template = PlanTemplate(
        id=uuid.uuid4(),
        group_id=group.id,
        name="Шаблон нагрузки",
        start_date=date.today(),
        duration_days=1,
    )
    db.add(template)
    await db.flush()

    workout = IndividualWorkout(
        id=uuid.uuid4(),
        template_id=template.id,
        athlete_id=profile.id,
        planned_date=date.today(),
        status="published",
    )
    db.add(workout)
    await db.flush()

    tel = ActualTelemetry(
        id=uuid.uuid4(),
        workout_id=workout.id,
        source="manual",
        actual_duration_min=60,
        avg_hr=150,
    )
    db.add(tel)
    await db.flush()
    return workout, tel
