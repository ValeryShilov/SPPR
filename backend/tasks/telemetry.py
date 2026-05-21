"""Celery-задачи для асинхронного парсинга телеметрии."""
import uuid

from backend.core.celery_app import celery_app


@celery_app.task(bind=True, name="tasks.parse_telemetry_file")
def parse_telemetry_file(self, workout_id: str, file_path: str) -> dict:
    """Парсинг файла телеметрии (FIT/GPX/TCX/CSV).

    После парсинга вызывает calculate_load_indexes → generate_alerts.
    """
    # TODO: определить формат файла, распарсить, сохранить ActualTelemetry,
    #       обновить training_load_history, сгенерировать алерты
    raise NotImplementedError


@celery_app.task(name="tasks.aggregate_session_metrics")
def aggregate_session_metrics(workout_id: str) -> dict:
    """Агрегация итоговых метрик сессии: дистанция, время в зонах, темп, TSS."""
    # TODO: рассчитать и сохранить в actual_telemetry
    raise NotImplementedError
