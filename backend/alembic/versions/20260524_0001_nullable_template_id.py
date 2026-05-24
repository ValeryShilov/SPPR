"""make template_id nullable in individual_workouts

Revision ID: 20260524_0001
Revises: 20260522_0001
Create Date: 2026-05-24
"""
from alembic import op

revision = '20260524_0001'
down_revision = '20260522_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('individual_workouts', 'template_id', nullable=True)


def downgrade() -> None:
    op.alter_column('individual_workouts', 'template_id', nullable=False)
