"""Celery-задача адаптации шаблона плана.

Поток выполнения:
  1. adapt_template_task получает template_id (str UUID)
  2. Создаёт собственный engine (та же техника, что в tasks/telemetry.py)
  3. Вызывает services.analytics.adapt_template → список UUID созданных тренировок
  4. Возвращает {"created": N, "workout_ids": [...]}
"""
import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.core.celery_app import celery_app
from backend.core.config import settings
from backend.services.analytics import adapt_template


async def _run_adapt(template_id: uuid.UUID) -> dict:
    _engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=1)
    try:
        async with AsyncSession(_engine, expire_on_commit=False) as db:
            ids = await adapt_template(template_id, db)
            await db.commit()
    finally:
        await _engine.dispose()

    return {
        "template_id": str(template_id),
        "created": len(ids),
        "workout_ids": [str(i) for i in ids],
    }


@celery_app.task(
    bind=True,
    name="tasks.adapt_template",
    max_retries=3,
    default_retry_delay=60,
)
def adapt_template_task(self, template_id: str) -> dict:
    """Создаёт черновики individual_workouts для всех спортсменов группы.

    Аргументы:
        template_id — UUID шаблона (str).

    Повторяет до 3 раз при инфраструктурных ошибках;
    ValueError (шаблон не найден, пустая группа) не повторяется.
    """
    try:
        tid = uuid.UUID(template_id)
        return asyncio.run(_run_adapt(tid))
    except ValueError:
        raise
    except Exception as exc:
        raise self.retry(exc=exc)
