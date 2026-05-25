"""add training goal fields to athlete_profiles

Revision ID: 20260524_0005
Revises: 20260524_0004
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = '20260524_0005'
down_revision = '20260524_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('athlete_profiles',
        sa.Column('training_goal_type', sa.String(50), nullable=True))
    op.add_column('athlete_profiles',
        sa.Column('target_event_name', sa.String(200), nullable=True))
    op.add_column('athlete_profiles',
        sa.Column('target_event_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('athlete_profiles', 'target_event_date')
    op.drop_column('athlete_profiles', 'target_event_name')
    op.drop_column('athlete_profiles', 'training_goal_type')
