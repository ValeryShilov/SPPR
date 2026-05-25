"""add timeseries jsonb to actual_telemetry

Revision ID: 20260524_0003
Revises: 20260524_0002
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '20260524_0003'
down_revision = '20260524_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('actual_telemetry', sa.Column('timeseries', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('actual_telemetry', 'timeseries')
