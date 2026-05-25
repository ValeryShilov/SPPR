"""add rpe and comment to actual_telemetry

Revision ID: 20260524_0002
Revises: 20260524_0001
Create Date: 2026-05-24
"""
import sqlalchemy as sa
from alembic import op

revision = '20260524_0002'
down_revision = '20260524_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('actual_telemetry', sa.Column('rpe', sa.Integer(), nullable=True))
    op.add_column('actual_telemetry', sa.Column('comment', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('actual_telemetry', 'comment')
    op.drop_column('actual_telemetry', 'rpe')
