"""Добавить пол в аккаунт пользователя.

Revision ID: 20261002_0001
Revises: 20260904_0001
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa

revision = "20261002_0001"
down_revision = "20260904_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("gender", sa.String(length=1), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "gender")
