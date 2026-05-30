"""plan_templates.group_id nullable for group deletion support

Revision ID: 20260529_0001
Revises: 20260526_0001
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = '20260529_0001'
down_revision = '20260526_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('plan_templates', 'group_id', nullable=True)


def downgrade() -> None:
    # Обнулённые group_id нужно обработать вручную перед downgrade
    op.alter_column('plan_templates', 'group_id', nullable=False)
