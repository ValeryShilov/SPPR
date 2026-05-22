from celery import Celery

from backend.core.config import settings

celery_app = Celery(
    "sppr",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["backend.tasks.telemetry", "backend.tasks.planning"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Отображать состояние STARTED (нужно для /telemetry/status/{task_id})
    task_track_started=True,
    # Подтверждать задачу только после завершения — безопаснее при перезапуске воркера
    task_acks_late=True,
    # Один prefetch: длинные задачи парсинга не должны блокировать очередь
    worker_prefetch_multiplier=1,
    # Хранить результаты 24 часа, этого достаточно для опроса статуса
    result_expires=86400,
)
