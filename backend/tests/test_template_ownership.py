"""Проверки владения шаблоном независимо от существования группы."""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.routers.templates import _get_owned_template, update_template
from backend.routers.workouts import _get_accessible_workout
from backend.schemas.plan import PlanTemplateUpdate


@pytest.mark.parametrize("owns_template", [True, False])
async def test_workout_access_after_group_deletion(owns_template):
    coach = SimpleNamespace(id=uuid.uuid4(), role="coach")
    template = SimpleNamespace(
        id=uuid.uuid4(), group_id=None,
        coach_user_id=coach.id if owns_template else uuid.uuid4(),
    )
    workout = SimpleNamespace(id=uuid.uuid4(), template_id=template.id)
    db = SimpleNamespace(get=AsyncMock(side_effect=[workout, template]))

    if owns_template:
        assert await _get_accessible_workout(workout.id, db, coach) is workout
    else:
        with pytest.raises(HTTPException) as exc:
            await _get_accessible_workout(workout.id, db, coach)
        assert exc.value.status_code == 403


async def test_legacy_template_uses_group_owner():
    coach = SimpleNamespace(id=uuid.uuid4(), role="coach")
    template = SimpleNamespace(id=uuid.uuid4(), coach_user_id=None, group_id=uuid.uuid4())
    group = SimpleNamespace(coach_user_id=coach.id)
    workout = SimpleNamespace(id=uuid.uuid4(), template_id=template.id)
    db = SimpleNamespace(get=AsyncMock(side_effect=[workout, template, group]))

    assert await _get_accessible_workout(workout.id, db, coach) is workout


async def test_orphan_without_owner_is_inaccessible_to_coach():
    coach = SimpleNamespace(id=uuid.uuid4(), role="coach")
    template = SimpleNamespace(id=uuid.uuid4(), coach_user_id=None, group_id=None)
    db = SimpleNamespace(get=AsyncMock(return_value=template))

    with pytest.raises(HTTPException) as exc:
        await _get_owned_template(template.id, db, coach)
    assert exc.value.status_code == 403


@pytest.mark.parametrize("new_group_owner", ["self", "other", "missing"])
async def test_reassign_template_checks_new_group_owner(new_group_owner):
    coach = SimpleNamespace(id=uuid.uuid4(), role="coach")
    previous_group_id = uuid.uuid4()
    template = SimpleNamespace(id=uuid.uuid4(), coach_user_id=coach.id, group_id=previous_group_id)
    target_id = uuid.uuid4()
    group = None if new_group_owner == "missing" else SimpleNamespace(
        coach_user_id=coach.id if new_group_owner == "self" else uuid.uuid4(),
    )
    db = SimpleNamespace(
        get=AsyncMock(side_effect=[template, group]), execute=AsyncMock(),
        commit=AsyncMock(), refresh=AsyncMock(),
    )
    data = PlanTemplateUpdate(group_id=target_id)

    if new_group_owner == "self":
        assert await update_template(template.id, data, db, coach) is template
        assert template.group_id == target_id
    else:
        with pytest.raises(HTTPException) as exc:
            await update_template(template.id, data, db, coach)
        assert exc.value.status_code == 403
        assert template.group_id == previous_group_id
        db.execute.assert_not_awaited()
        db.commit.assert_not_awaited()
