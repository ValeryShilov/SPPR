"""plan_templates.updated_at для индикатора устаревания матрицы

Revision ID: 20260530_0001
Revises: 20260529_0001
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = '20260530_0001'
down_revision = '20260529_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'plan_templates',
        sa.Column(
            'updated_at',
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('plan_templates', 'updated_at')
