"""add coach_user_id to athlete_profiles

Revision ID: 20260524_0004
Revises: 20260524_0003
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '20260524_0004'
down_revision = '20260524_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'athlete_profiles',
        sa.Column('coach_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('athlete_profiles', 'coach_user_id')
