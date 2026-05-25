"""Celery-задача парсинга телеметрии.

Поток выполнения:
  1. parse_telemetry_file получает путь к файлу и формат
  2. Вызывает соответствующий парсер (_parse_fit / _parse_gpx / _parse_tcx / _parse_csv)
  3. Парсер возвращает (raw_metrics, unified_series)
     unified_series — список кортежей (timestamp, hr | None, speed_ms | None)
  4. Async-ядро _process_telemetry:
       a. Открывает сессию с новым engine (для корректной работы event loop в Celery)
       b. Загружает HR-зоны атлета для расчёта времени в зонах
       c. Строит downsampled timeseries с метками зон
       d. Сохраняет / обновляет actual_telemetry
       e. Вызывает calculate_load_indexes → обновляет training_load_history
       f. Вызывает generate_alerts → создаёт диагностические алерты
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

# Unified series type: list of (timestamp, hr | None, speed_m_s | None)
UnifiedSeries = list[tuple[datetime, "int | None", "float | None"]]


# ═══════════════════════════════════════════════════════════════════════════
# Парсеры файлов телеметрии
# Каждый возвращает (raw_metrics: dict, unified_series: UnifiedSeries)
# raw_metrics содержит: actual_duration_min, distance_km, avg_hr, max_hr
# unified_series — тройки (метка_времени, пульс | None, скорость_м/с | None)
# ═══════════════════════════════════════════════════════════════════════════

def _parse_fit(file_path: str) -> tuple[dict, UnifiedSeries]:
    """Парсер бинарного формата Garmin FIT (библиотека fitparse)."""
    from fitparse import FitFile

    fitfile = FitFile(file_path)
    series: UnifiedSeries = []
    hr_values: list[int] = []
    distance = 0.0
    timestamps: list[datetime] = []

    for record in fitfile.get_messages("record"):
        fields = {f.name: f.value for f in record}
        ts = fields.get("timestamp")
        hr = fields.get("heart_rate")
        spd = fields.get("speed")   # m/s
        dist = fields.get("distance")

        if ts is not None:
            timestamps.append(ts)
        if hr is not None:
            hr_values.append(int(hr))
        if dist is not None:
            distance = float(dist)
        if ts is not None:
            series.append((ts, int(hr) if hr is not None else None, float(spd) if spd is not None else None))

    if not timestamps:
        return {}, []

    duration_min = round((timestamps[-1] - timestamps[0]).total_seconds() / 60)
    return {
        "actual_duration_min": duration_min,
        "distance_km": round(distance / 1000, 3) if distance else None,
        "avg_hr": round(sum(hr_values) / len(hr_values)) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
    }, series


def _parse_gpx(file_path: str) -> tuple[dict, UnifiedSeries]:
    """Парсер XML-формата GPX (библиотека gpxpy)."""
    import gpxpy
    import math

    with open(file_path, "r", encoding="utf-8") as fh:
        gpx = gpxpy.parse(fh)

    hr_values: list[int] = []
    series: UnifiedSeries = []

    for track in gpx.tracks:
        for segment in track.segments:
            prev_point = None
            for point in segment.points:
                hr: int | None = None
                if point.extensions:
                    for ext in point.extensions:
                        hr_node = ext.find(".//{*}hr")
                        if hr_node is not None:
                            try:
                                hr = int(hr_node.text)
                                hr_values.append(hr)
                            except (ValueError, TypeError):
                                hr = None

                spd: float | None = None
                if prev_point is not None and point.time is not None and prev_point.time is not None:
                    dt_sec = (point.time - prev_point.time).total_seconds()
                    if dt_sec > 0:
                        dist_m = point.distance_3d(prev_point)
                        if dist_m is not None and dist_m > 0:
                            spd = dist_m / dt_sec  # m/s

                if point.time is not None:
                    series.append((point.time, hr, spd))
                prev_point = point

    duration_sec = gpx.get_duration()
    distance_m = gpx.length_3d()

    return {
        "actual_duration_min": round(duration_sec / 60) if duration_sec else None,
        "distance_km": round(distance_m / 1000, 3) if distance_m else None,
        "avg_hr": round(sum(hr_values) / len(hr_values)) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
    }, series


def _parse_tcx(file_path: str) -> tuple[dict, UnifiedSeries]:
    """Парсер XML-формата Garmin TCX (библиотека lxml)."""
    from lxml import etree

    _NS = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}

    tree = etree.parse(file_path)
    root = tree.getroot()

    hr_values: list[int] = []
    series: UnifiedSeries = []
    timestamps: list[datetime] = []
    total_distance = 0.0

    prev_dist_m: float | None = None
    prev_ts: datetime | None = None

    for tp in root.findall(".//tcx:Trackpoint", _NS):
        time_node = tp.find("tcx:Time", _NS)
        hr_node = tp.find(".//tcx:HeartRateBpm/tcx:Value", _NS)
        dist_node = tp.find("tcx:DistanceMeters", _NS)

        ts: datetime | None = None
        if time_node is not None and time_node.text:
            try:
                ts = datetime.fromisoformat(
                    time_node.text.rstrip("Z")
                ).replace(tzinfo=timezone.utc)
                timestamps.append(ts)
            except ValueError:
                pass

        hr: int | None = None
        if hr_node is not None and hr_node.text:
            try:
                hr = int(hr_node.text)
                hr_values.append(hr)
            except ValueError:
                pass

        spd: float | None = None
        if dist_node is not None and dist_node.text:
            try:
                curr_dist_m = float(dist_node.text)
                if prev_dist_m is not None and prev_ts is not None and ts is not None:
                    dt_sec = (ts - prev_ts).total_seconds()
                    delta_m = curr_dist_m - prev_dist_m
                    if dt_sec > 0 and delta_m >= 0:
                        spd = delta_m / dt_sec
                prev_dist_m = curr_dist_m
                prev_ts = ts
            except ValueError:
                pass

        if ts is not None:
            series.append((ts, hr, spd))

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

    hr_vals_non_null = [h for h in hr_values if h is not None]
    return {
        "actual_duration_min": duration_min,
        "distance_km": round(total_distance / 1000, 3) if total_distance else None,
        "avg_hr": round(sum(hr_vals_non_null) / len(hr_vals_non_null)) if hr_vals_non_null else None,
        "max_hr": max(hr_vals_non_null) if hr_vals_non_null else None,
    }, series


def _parse_csv(file_path: str) -> tuple[dict, UnifiedSeries]:
    """Парсер CSV с гибким маппингом колонок (библиотека pandas)."""
    import pandas as pd

    _COL_MAP: dict[str, list[str]] = {
        "heart_rate": ["heart_rate", "hr", "HeartRate", "pulse", "Pulse"],
        "distance": ["distance", "Distance", "dist", "km"],
        "speed": ["speed", "Speed", "spd", "velocity"],
        "time": ["time", "timestamp", "Time", "Timestamp", "elapsed"],
    }

    def _find_col(df: "pd.DataFrame", variants: list[str]) -> str | None:
        for v in variants:
            if v in df.columns:
                return v
        return None

    df = pd.read_csv(file_path)
    df.columns = df.columns.str.strip()

    hr_col   = _find_col(df, _COL_MAP["heart_rate"])
    dist_col = _find_col(df, _COL_MAP["distance"])
    spd_col  = _find_col(df, _COL_MAP["speed"])
    time_col = _find_col(df, _COL_MAP["time"])

    raw: dict = {}
    series: UnifiedSeries = []

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

            aligned_cols = [time_col]
            if hr_col:
                aligned_cols.append(hr_col)
            if spd_col:
                aligned_cols.append(spd_col)

            aligned = df[aligned_cols].copy()
            aligned["_t"] = pd.to_datetime(aligned[time_col], utc=True, errors="coerce")
            aligned = aligned.dropna(subset=["_t"])

            for _, row in aligned.iterrows():
                t = row["_t"].to_pydatetime()
                hr = int(row[hr_col]) if hr_col and pd.notna(row.get(hr_col)) else None
                spd_raw = row.get(spd_col) if spd_col else None
                # CSV speed может быть в км/ч → конвертируем в м/с
                spd = float(spd_raw) / 3.6 if spd_raw is not None and pd.notna(spd_raw) else None
                series.append((t, hr, spd))
        except Exception:
            pass

    return raw, series


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
    """Считает минуты в каждой зоне (Z1–Z5) по временному ряду пульса."""
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
            matched_zone = "Z1" if hr < zones[0].hr_min else "Z5"

        zone_seconds[matched_zone] += dt

    return {k: round(v / 60) for k, v in zone_seconds.items()}


# ═══════════════════════════════════════════════════════════════════════════
# Построение downsampled timeseries с метками зон
# ═══════════════════════════════════════════════════════════════════════════

def _zone_for_hr(hr: int, zones: list) -> str:
    for z in zones:
        if z.hr_min <= hr <= z.hr_max:
            return z.zone
    return "Z1" if hr < zones[0].hr_min else "Z5"


def _build_timeseries(
    series: UnifiedSeries,
    zones: list | None,
    max_points: int = 500,
) -> list[dict]:
    """Строит downsampled timeseries для хранения в БД.

    Каждая точка: {"s": int, "hr"?: int, "z"?: str, "spd"?: float}
    spd — скорость в м/с, конвертация в нужные единицы на фронтенде.
    """
    if not series:
        return []

    start = series[0][0]
    step = max(1, len(series) // max_points)
    sampled = series[::step]

    result: list[dict] = []
    for ts, hr, spd in sampled:
        s = round((ts - start).total_seconds())
        point: dict = {"s": s}
        if hr is not None:
            point["hr"] = hr
            if zones:
                point["z"] = _zone_for_hr(hr, zones)
        if spd is not None and spd > 0:
            point["spd"] = round(spd, 3)
        result.append(point)

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Асинхронное ядро обработки
# ═══════════════════════════════════════════════════════════════════════════

async def _process_telemetry(
    workout_id: uuid.UUID,
    raw: dict,
    series: UnifiedSeries,
) -> dict:
    """Сохраняет телеметрию и запускает расчёт индексов нагрузки и алертов."""
    _engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=1)
    try:
        async with AsyncSession(_engine, expire_on_commit=False) as db:
            workout = await db.get(IndividualWorkout, workout_id)
            if not workout:
                raise ValueError(f"Тренировка {workout_id} не найдена")

            hr_series = [(ts, hr) for ts, hr, _ in series if hr is not None]

            # Зоны ЧСС (опционально — при наличии маркеров)
            zone_mins: dict[str, int] = {}
            resolved_zones: list | None = None
            if hr_series:
                try:
                    zones_resp = await calculate_hr_zones(workout.athlete_id, db)
                    resolved_zones = zones_resp.zones
                    zone_mins = _calc_zone_minutes(hr_series, resolved_zones)
                except Exception:
                    pass

            # Timeseries с метками зон
            timeseries = _build_timeseries(series, resolved_zones)

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
                "hr_zone1_min": zone_mins.get("Z1"),
                "hr_zone2_min": zone_mins.get("Z2"),
                "hr_zone3_min": zone_mins.get("Z3"),
                "hr_zone4_min": zone_mins.get("Z4"),
                "hr_zone5_min": zone_mins.get("Z5"),
                "timeseries": timeseries if timeseries else None,
            }

            if tel is not None:
                for field, value in tel_fields.items():
                    setattr(tel, field, value)
            else:
                tel = ActualTelemetry(workout_id=workout_id, **tel_fields)
                db.add(tel)

            await db.flush()

            await calculate_load_indexes(workout.athlete_id, workout_id, db)
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
        "timeseries_points": len(timeseries),
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
    """Парсит файл телеметрии и сохраняет результат в БД."""
    fmt = file_format.lower().lstrip(".")
    parser = _PARSERS.get(fmt)
    if parser is None:
        raise ValueError(f"Неподдерживаемый формат файла: {file_format!r}")

    try:
        raw, series = parser(file_path)
        wid = uuid.UUID(workout_id)
        return asyncio.run(_process_telemetry(wid, raw, series))
    except ValueError:
        raise
    except Exception as exc:
        raise self.retry(exc=exc)
