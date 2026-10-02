"""Обновление аккаунта различает пропущенное поле и явную очистку."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.routers.auth import update_me as update_auth_account
from backend.routers.users import update_me as update_users_account
from backend.schemas.auth import UpdateProfileRequest


@pytest.mark.parametrize("update_account", [update_auth_account, update_users_account])
@pytest.mark.parametrize("payload, expected_name", [
    ({"gender": "f"}, "Тестовое имя"),
    ({"full_name": None}, None),
    ({"full_name": "   "}, None),
    ({"full_name": " Новое имя "}, "Новое имя"),
])
async def test_name_update_semantics(update_account, payload, expected_name):
    account = SimpleNamespace(full_name="Тестовое имя", gender="m")
    db = SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock())

    await update_account(
        UpdateProfileRequest(**payload), current_user=account, db=db,
    )

    assert account.full_name == expected_name
    assert account.gender == payload.get("gender", "m")
