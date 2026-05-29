"""add alert_settings table

Revision ID: 20260526_0001
Revises: 20260524_0005
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '20260526_0001'
down_revision = '20260524_0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'alert_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('p1_tsb_threshold',  sa.Float(), nullable=False, server_default='-30.0'),
        sa.Column('p2_resting_hr_pct', sa.Float(), nullable=False, server_default='7.0'),
        sa.Column('p3_hrv_pct',        sa.Float(), nullable=False, server_default='85.0'),
        sa.Column('p5_z45_pct',        sa.Float(), nullable=False, server_default='20.0'),
        sa.Column('h1_ctl_delta',      sa.Float(), nullable=False, server_default='2.0'),
        sa.Column('h2_tsb_high',       sa.Float(), nullable=False, server_default='15.0'),
        sa.Column('h3_tss_pct',        sa.Float(), nullable=False, server_default='50.0'),
        sa.Column('h5_z12_pct',        sa.Float(), nullable=False, server_default='75.0'),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_by_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('alert_settings')
