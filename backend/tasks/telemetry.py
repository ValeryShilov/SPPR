"""Celery-задача парсинга телеметрии.

Поток выполнения:
  1. parse_telemetry_file получает путь к файлу и формат
  2. Вызывает соответствующий парсер (_parse_fit / _parse_gpx / _parse_tcx / _parse_csv)
  3. Парсер возвращает (raw_metrics, hr_timeseries)
  4. Async-ядро _process_telemetry:
       a. Открывает сессию с новым engine (для корректной работы event loop в Celery)
       b. Загружает HR-зоны атлета для расчёта времени в зонах
       c. Сохраняет / обновляет actual_telemetry
       d. Вызывает calculate_load_indexes → обновляет training_load_history
       e. Вызывает generate_alerts → создаёт диагностические алерты
"""
import asyncio
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.core.celery_app import celery_app
from backend.core.config import settings
from backend.models.plan import IndividualWorkout
from backend.models.telemetry import ActualTelemetry
from backend.services.analytics import (
    calculate_hr_zones,
    calculate_load_indexes,
    generate_alerts,
)


# ═══════════════════════════════════════════════════════════════════════════
# Парсеры файлов телеметрии
# Каждый возвращает (raw_metrics: dict, hr_timeseries: list[tuple[datetime, int]])
# raw_metrics содержит: actual_duration_min, distance_km, avg_hr, max_hr
# hr_timeseries — пары (метка_времени, пульс) для расчёта времени в зонах
# ═══════════════════════════════════════════════════════════════════════════

def _parse_fit(file_path: str) -> tuple[dict, list[tuple[datetime, int]]]:
    """Парсер бинарного формата Garmin FIT (библиотека fitparse)."""
    from fitparse import FitFile

    fitfile = FitFile(file_path)
    hr_values: list[int] = []
    hr_series: list[tuple[datetime, int]] = []
    distance = 0.0
    timestamps: list[datetime] = []

    for record in fitfile.get_messages("record"):
        fields = {f.name: f.value for f in record}
        ts = fields.get("timestamp")
        hr = fields.get("heart_rate")
        dist = fields.get("distance")

        if ts is not None:
            timestamps.append(ts)
        if hr is not None:
            hr_values.append(int(hr))
            if ts is not None:
                hr_series.append((ts, int(hr)))
        if dist is not None:
            distance = float(dist)

    if not timestamps:
        return {}, []

    duration_min = round((timestamps[-1] - timestamps[0]).total_seconds() / 60)
    return {
        "actual_duration_min": duration_min,
        "distance_km": round(distance / 1000, 3) if distance else None,
        "avg_hr": round(sum(hr_values) / len(hr_values)) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
    }, hr_series


def _parse_gpx(file_path: str) -> tuple[dict, list[tuple[datetime, int]]]:
    """Парсер XML-формата GPX (библиотека gpxpy)."""
    import gpxpy

    with open(file_path, "r", encoding="utf-8") as fh:
        gpx = gpxpy.parse(fh)

    hr_values: list[int] = []
    hr_series: list[tuple[datetime, int]] = []

    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                if not point.extensions:
                    continue
                for ext in point.extensions:
                    hr_node = ext.find(".//{*}hr")
                    if hr_node is None:
                        continue
                    try:
                        hr = int(hr_node.text)
                        hr_values.append(hr)
                        if point.time is not None:
                            hr_series.append((point.time, hr))
                    except (ValueError, TypeError):
                        pass

    duration_sec = gpx.get_duration()
    distance_m = gpx.length_3d()

    return {
        "actual_duration_min": round(duration_sec / 60) if duration_sec else None,
        "distance_km": round(distance_m / 1000, 3) if distance_m else None,
        "avg_hr": round(sum(hr_values) / len(hr_values)) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
    }, hr_series


def _parse_tcx(file_path: str) -> tuple[dict, list[tuple[datetime, int]]]:
    """Парсер XML-формата Garmin TCX (библиотека lxml)."""
    from lxml import etree

    _NS = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}

    tree = etree.parse(file_path)
    root = tree.getroot()

    hr_values: list[int] = []
    hr_series: list[tuple[datetime, int]] = []
    timestamps: list[datetime] = []
    total_distance = 0.0

    for tp in root.findall(".//tcx:Trackpoint", _NS):
        time_node = tp.find("tcx:Time", _NS)
        hr_node = tp.find(".//tcx:HeartRateBpm/tcx:Value", _NS)

        ts: datetime | None = None
        if time_node is not None and time_node.text:
            try:
                ts = datetime.fromisoformat(
                    time_node.text.rstrip("Z")
                ).replace(tzinfo=timezone.utc)
                timestamps.append(ts)
            except ValueError:
                pass

        if hr_node is not None and hr_node.text:
            try:
                hr = int(hr_node.text)
                hr_values.append(hr)
                if ts is not None:
                    hr_series.append((ts, hr))
            except ValueError:
                pass

    for lap in root.findall(".//tcx:Lap", _NS):
        dist_node = lap.find("tcx:DistanceMeters", _NS)
        if dist_node is not None and dist_node.text:
            try:
                total_distance += float(dist_node.text)
            except ValueError:
                pass

    duration_min: int | None = None
    if len(timestamps) >= 2:
        duration_min = round(
            (timestamps[-1] - timestamps[0]).total_seconds() / 60
        )

    return {
        "actual_duration_min": duration_min,
        "distance_km": round(total_distance / 1000, 3) if total_distance else None,
        "avg_hr": round(sum(hr_values) / len(hr_values)) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
    }, hr_series


def _parse_csv(file_path: str) -> tuple[dict, list[tuple[datetime, int]]]:
    """Парсер CSV с гибким маппингом колонок (библиотека pandas)."""
    import pandas as pd

    _COL_MAP: dict[str, list[str]] = {
        "heart_rate": ["heart_rate", "hr", "HeartRate", "pulse", "Pulse"],
        "distance": ["distance", "Distance", "dist", "km"],
        "time": ["time", "timestamp", "Time", "Timestamp", "elapsed"],
    }

    def _find_col(df: "pd.DataFrame", variants: list[str]) -> str | None:
        for v in variants:
            if v in df.columns:
                return v
        return None

    df = pd.read_csv(file_path)
    df.columns = df.columns.str.strip()

    hr_col = _find_col(df, _COL_MAP["heart_rate"])
    dist_col = _find_col(df, _COL_MAP["distance"])
    time_col = _find_col(df, _COL_MAP["time"])

    raw: dict = {}
    hr_series: list[tuple[datetime, int]] = []

    if hr_col:
        hr_vals = df[hr_col].dropna()
        if not hr_vals.empty:
            raw["avg_hr"] = round(float(hr_vals.mean()))
            raw["max_hr"] = int(hr_vals.max())

    if dist_col:
        max_dist = df[dist_col].dropna().max()
        if pd.notna(max_dist):
            raw["distance_km"] = round(float(max_dist), 3)

    if time_col:
        try:
            times = pd.to_datetime(df[time_col], utc=True, errors="coerce").dropna()
            if len(times) >= 2:
                raw["actual_duration_min"] = round(
                    (times.max() - times.min()).total_seconds() / 60
                )
            if hr_col:
                aligned = df[[time_col, hr_col]].dropna()
                times_aligned = pd.to_datetime(
                    aligned[time_col], utc=True, errors="coerce"
                )
                for t, h in zip(times_aligned, aligned[hr_col]):
                    if pd.notna(t) and pd.notna(h):
                        hr_series.append((t.to_pydatetime(), int(h)))
        except Exception:
            pass

    return raw, hr_series


_PARSERS: dict[str, callable] = {
    "fit": _parse_fit,
    "gpx": _parse_gpx,
    "tcx": _parse_tcx,
    "csv": _parse_csv,
}


# ═══════════════════════════════════════════════════════════════════════════
# Расчёт времени в зонах ЧСС
# ═══════════════════════════════════════════════════════════════════════════

def _calc_zone_minutes(
    hr_series: list[tuple[datetime, int]],
    zones: list,
) -> dict[str, int]:
    """Считает минуты в каждой зоне (Z1–Z5) по временному ряду пульса.

    Алгоритм: для каждого интервала между соседними точками берём ЧСС второй
    точки и определяем зону. Длина интервала в секундах добавляется в счётчик
    соответствующей зоны.
    """
    zone_seconds: dict[str, float] = {f"Z{i}": 0.0 for i in range(1, 6)}

    if len(hr_series) < 2:
        return {k: 0 for k in zone_seconds}

    for i in range(1, len(hr_series)):
        dt = (hr_series[i][0] - hr_series[i - 1][0]).total_seconds()
        if dt <= 0:
            continue

        hr = hr_series[i][1]
        matched_zone: str | None = None
        for z in zones:
            if z.hr_min <= hr <= z.hr_max:
                matched_zone = z.zone
                break
        if matched_zone is None:
            # ЧСС ниже Z1 → отдых; выше Z5 max → всё равно Z5
            matched_zone = "Z1" if hr < zones[0].hr_min else "Z5"

        zone_seconds[matched_zone] += dt

    return {k: round(v / 60) for k, v in zone_seconds.items()}


# ═══════════════════════════════════════════════════════════════════════════
# Асинхронное ядро обработки
# ═══════════════════════════════════════════════════════════════════════════

async def _process_telemetry(
    workout_id: uuid.UUID,
    raw: dict,
    hr_series: list[tuple[datetime, int]],
) -> dict:
    """Сохраняет телеметрию и запускает расчёт индексов нагрузки и алертов.

    Создаёт собственный engine, чтобы избежать привязки к чужому event loop
    Celery-воркера (при использовании asyncio.run в prefork-воркере).
    """
    _engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=1)
    try:
        async with AsyncSession(_engine, expire_on_commit=False) as db:
            workout = await db.get(IndividualWorkout, workout_id)
            if not workout:
                raise ValueError(f"Тренировка {workout_id} не найдена")

            # Расчёт времени в зонах ЧСС (опционально — при наличии маркеров)
            zone_mins: dict[str, int] = {}
            if hr_series:
                try:
                    zones_resp = await calculate_hr_zones(workout.athlete_id, db)
                    zone_mins = _calc_zone_minutes(hr_series, zones_resp.zones)
                except Exception:
                    # Нет маркеров или профиля → пропускаем зоны, не прерываем задачу
                    pass

            # Upsert actual_telemetry -----------------------------------------
            res = await db.execute(
                select(ActualTelemetry).where(
                    ActualTelemetry.workout_id == workout_id
                )
            )
            tel = res.scalar_one_or_none()

            tel_fields: dict = {
                "source": "imported",
                "actual_duration_min": raw.get("actual_duration_min"),
                "distance_km": (
                    Decimal(str(raw["distance_km"]))
                    if raw.get("distance_km") is not None
                    else None
                ),
                "avg_hr": raw.get("avg_hr"),
                "max_hr": raw.get("max_hr"),
                # zone_mins пуст если расчёт пропущен → .get() вернёт None
                "hr_zone1_min": zone_mins.get("Z1"),
                "hr_zone2_min": zone_mins.get("Z2"),
                "hr_zone3_min": zone_mins.get("Z3"),
                "hr_zone4_min": zone_mins.get("Z4"),
                "hr_zone5_min": zone_mins.get("Z5"),
            }

            if tel is not None:
                for field, value in tel_fields.items():
                    setattr(tel, field, value)
            else:
                tel = ActualTelemetry(workout_id=workout_id, **tel_fields)
                db.add(tel)

            await db.flush()

            # Индексы нагрузки (TSS / ATL / CTL / TSB) -----------------------
            await calculate_load_indexes(workout.athlete_id, workout_id, db)

            # Диагностические алерты -----------------------------------------
            await generate_alerts(
                workout.athlete_id,
                db,
                triggered_by_workout_id=workout_id,
            )
    finally:
        await _engine.dispose()

    return {
        "workout_id": str(workout_id),
        "actual_duration_min": raw.get("actual_duration_min"),
        "distance_km": raw.get("distance_km"),
        "avg_hr": raw.get("avg_hr"),
        "max_hr": raw.get("max_hr"),
        "zones_calculated": bool(zone_mins),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Celery-задача
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(
    bind=True,
    name="tasks.parse_telemetry_file",
    max_retries=3,
    default_retry_delay=60,
)
def parse_telemetry_file(
    self,
    workout_id: str,
    file_path: str,
    file_format: str,
) -> dict:
    """Парсит файл телеметрии и сохраняет результат в БД.

    Аргументы:
        workout_id   — UUID тренировки (str).
        file_path    — абсолютный путь к загруженному файлу.
        file_format  — расширение без точки: fit | gpx | tcx | csv.

    Возвращает словарь с основными метриками сессии.
    Повторяет до 3 раз с интервалом 60 с при любых ошибках,
    кроме ValueError (неверный формат или отсутствующая тренировка).
    """
    fmt = file_format.lower().lstrip(".")
    parser = _PARSERS.get(fmt)
    if parser is None:
        # Логическая ошибка — повторять бессмысленно
        raise ValueError(f"Неподдерживаемый формат файла: {file_format!r}")

    try:
        raw, hr_series = parser(file_path)
        wid = uuid.UUID(workout_id)
        return asyncio.run(_process_telemetry(wid, raw, hr_series))
    except ValueError:
        raise
    except Exception as exc:
        raise self.retry(exc=exc)
