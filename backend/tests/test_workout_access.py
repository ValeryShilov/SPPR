"""Регресс-тесты на множественность в предметной области.

Два инварианта, которые легко нарушить неявным предположением «один к одному»:

1. Атлет может состоять в НЕСКОЛЬКИХ группах одного тренера.
   Проверки доступа не должны падать с MultipleResultsFound — раньше
   scalar_one_or_none() на запросе членств давал 500.

2. У атлета может быть НЕСКОЛЬКО тренировок в один день (двух-/трёхсеансовые
   дни, наложение шаблонов разных групп). /upcoming должен возвращать все,
   а не схлопывать в одну (раньше был дедуп по дате).
"""
import uuid
from datetime import date, timedelta

import pytest_asyncio
from sqlalchemy import select

from backend.models.athlete import AthleteProfile
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout
from backend.models.user import User
from backend.routers.athletes import _get_accessible_profile, get_upcoming
from backend.routers.workouts import _get_accessible_workout, create_workout
from backend.schemas.plan import IndividualWorkoutCreate


@pytest_asyncio.fixture
async def multi_group_athlete(db):
    """Тренер + атлет в ДВУХ группах этого тренера + 3 тренировки на один день."""
    coach = User(id=uuid.uuid4(), email=f"c{uuid.uuid4()}@t.ex",
                 password_hash="x", role="coach", is_active=True)
    athlete_user = User(id=uuid.uuid4(), email=f"a{uuid.uuid4()}@t.ex",
                        password_hash="x", role="athlete", is_active=True)
    db.add_all([coach, athlete_user])
    await db.flush()

    profile = AthleteProfile(
        id=uuid.uuid4(), user_id=athlete_user.id,
        first_name="Мульти", last_name="Атлет",
        birth_date=date(1990, 1, 1), gender="m",
    )
    db.add(profile)

    g1 = TrainingGroup(id=uuid.uuid4(), coach_user_id=coach.id, name="Группа 1")
    g2 = TrainingGroup(id=uuid.uuid4(), coach_user_id=coach.id, name="Группа 2")
    db.add_all([g1, g2])
    await db.flush()

    db.add_all([
        GroupMembership(id=uuid.uuid4(), group_id=g1.id, athlete_id=profile.id,
                        joined_at=date.today(), is_active=True),
        GroupMembership(id=uuid.uuid4(), group_id=g2.id, athlete_id=profile.id,
                        joined_at=date.today(), is_active=True),
    ])

    day = date.today() + timedelta(days=1)
    for w_type, st in [("run", "published"), ("bike", "draft"), ("strength", "draft")]:
        db.add(IndividualWorkout(
            id=uuid.uuid4(), template_id=None, athlete_id=profile.id,
            planned_date=day, workout_type=w_type, status=st,
        ))
    await db.flush()
    return coach, profile, day


async def test_access_profile_multi_group_no_crash(db, multi_group_athlete):
    """require_manage=True идёт по ветке членства — не должно падать на 2 группах."""
    coach, profile, _ = multi_group_athlete
    result = await _get_accessible_profile(profile.id, db, coach, require_manage=True)
    assert result.id == profile.id


async def test_access_manual_workout_multi_group_no_crash(db, multi_group_athlete):
    """Доступ к ручной тренировке (template_id=None) идёт по ветке членства."""
    coach, profile, _ = multi_group_athlete
    res = await db.execute(
        select(IndividualWorkout).where(IndividualWorkout.athlete_id == profile.id).limit(1)
    )
    workout = res.scalars().first()
    got = await _get_accessible_workout(workout.id, db, coach)
    assert got.id == workout.id


async def test_create_workout_multi_group_no_crash(db, multi_group_athlete):
    """Создание тренировки тренером для атлета из нескольких его групп."""
    coach, profile, day = multi_group_athlete
    data = IndividualWorkoutCreate(
        athlete_id=profile.id, planned_date=day, workout_type="run", status="draft",
    )
    workout = await create_workout(data, db, coach)
    assert workout.athlete_id == profile.id


async def test_upcoming_returns_all_workouts_same_day(db, multi_group_athlete):
    """/upcoming не должен схлопывать несколько тренировок одного дня в одну."""
    coach, profile, day = multi_group_athlete
    items = await get_upcoming(profile.id, db, coach)
    same_day = [w for w in items if w.planned_date == day]
    assert len(same_day) == 3
