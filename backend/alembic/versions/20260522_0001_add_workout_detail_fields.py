"""add workout_type/subtype/description/interval_structure to individual_workouts

Revision ID: 20260522_0001
Revises: 20260521_0001
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260522_0001"
down_revision = "20260521_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("individual_workouts", sa.Column("workout_type", sa.String(50), nullable=True))
    op.add_column("individual_workouts", sa.Column("workout_subtype", sa.String(50), nullable=True))
    op.add_column("individual_workouts", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("individual_workouts", sa.Column("interval_structure", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("individual_workouts", "interval_structure")
    op.drop_column("individual_workouts", "description")
    op.drop_column("individual_workouts", "workout_subtype")
    op.drop_column("individual_workouts", "workout_type")
