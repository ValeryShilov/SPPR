"""plan_templates.coach_user_id — владелец шаблона независимо от группы

Без этого поля шаблон с обнулённым group_id (группа удалена) становился
недоступен тренеру: проверка прав шла только через группу.

Revision ID: 20260904_0001
Revises: 20260530_0001
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260904_0001'
down_revision = '20260530_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'plan_templates',
        sa.Column('coach_user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_plan_templates_coach_user_id',
        'plan_templates', 'users',
        ['coach_user_id'], ['id'],
    )
    op.create_index(
        'ix_plan_templates_coach_user_id', 'plan_templates', ['coach_user_id'],
    )

    # Проставляем владельца существующим шаблонам по тренеру их группы.
    # У шаблонов, чья группа уже удалена, владелец останется NULL —
    # такие остаются доступны только администратору.
    op.execute("""
        UPDATE plan_templates AS pt
        SET coach_user_id = tg.coach_user_id
        FROM training_groups AS tg
        WHERE pt.group_id = tg.id
          AND pt.coach_user_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_plan_templates_coach_user_id', table_name='plan_templates')
    op.drop_constraint(
        'fk_plan_templates_coach_user_id', 'plan_templates', type_='foreignkey',
    )
    op.drop_column('plan_templates', 'coach_user_id')
