"""add week_schedule to plan_templates

Revision ID: 20260521_0001
Revises: 1c3c2c7bc925
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260521_0001"
down_revision = "1c3c2c7bc925"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plan_templates",
        sa.Column("week_schedule", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("plan_templates", "week_schedule")
