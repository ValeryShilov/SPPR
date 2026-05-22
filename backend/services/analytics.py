"""Аналитическое ядро СППР.

Четыре изолированных публичных функции вызываются из роутеров и Celery-задач;
HTTP-слой в этом модуле не импортируется.

Структура модуля
────────────────
  Справочные данные        — константы зон ЧСС и методических ограничений
  Чистые вычисления        — _k_qual, _k_form, _prognosis_tss, _trailing_run …
  Зоны ЧСС                 — _fetch_max_hr, _fetch_threshold_hr, _build_zones
  Адаптация шаблона        — _resolve_athlete_params
  Индексы нагрузки         — _resolve_threshold_hr, _compute_workout_tss, …
  Алерты — данные          — _AlertContext, _load_alert_context
  Алерты — правила         — _check_p1 … _check_h5, _ALERT_RULES
  Алерты — сохранение      — _persist_new_alerts
  Публичные функции        — calculate_hr_zones, adapt_template,
                             calculate_load_indexes, generate_alerts
"""
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.models.alerts import DiagnosticAlert
from backend.models.athlete import (
    AthleteProfile,
    PhysiologicalMarker,
    SubjectiveMetric,
    TrainingLoadHistory,
)
from backend.models.group import GroupMembership
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.telemetry import ActualTelemetry
from backend.schemas.analytics import AlertRead
from backend.schemas.athlete import HRZone, HRZonesResponse


# ═══════════════════════════════════════════════════════════════════════════
# Справочные данные
# ═══════════════════════════════════════════════════════════════════════════

# (код, метка, % min, % max)
_ZONE_DEFS: list[tuple[str, str, int, int]] = [
    ("Z1", "Восстановление",    60,  72),
    ("Z2", "Аэробная база",     73,  82),
    ("Z3", "Темповая",          83,  87),
    ("Z4", "Анаэробный порог",  88,  91),
    ("Z5", "Максимальная",      92, 100),
]

# Методические ограничения длительности тренировки по зонам (мин)
_ZONE_MAX_MIN: dict[str, int] = {"Z1": 240, "Z2": 240, "Z3": 120, "Z4": 90, "Z5": 60}

# Средняя точка зоны (% от ЧССmax) — для прогнозного TSS черновиков
_ZONE_MIDPOINTS: dict[str, float] = {z: (lo + hi) / 2 for z, _, lo, hi in _ZONE_DEFS}


# ═══════════════════════════════════════════════════════════════════════════
# Чистые вычислительные функции (без I/O, детерминированы)
# ═══════════════════════════════════════════════════════════════════════════

def _k_qual(qualification: str | None) -> float:
    """k_qual по строке квалификации: МС/МСМК→1.20, КМС→1.10, I→1.00, II/III→0.85, else→0.70."""
    q = (qualification or "").strip().upper()
    if "МС" in q:
        return 1.20
    if "КМС" in q:
        return 1.10
    if "I" in q and "II" not in q and "III" not in q:
        return 1.00
    if "II" in q or "III" in q:
        return 0.85
    return 0.70


def _k_form(tsb: float) -> float:
    """k_form по TSB: >5→1.05, ≥-10→1.00, ≥-25→0.90, <-25→0.75."""
    if tsb > 5:    return 1.05
    if tsb >= -10: return 1.00
    if tsb >= -25: return 0.90
    return 0.75


def _zone_for_pct(pct: float) -> str:
    """Возвращает код зоны (Z1–Z5) для заданного процента от ЧССmax."""
    for code, _, lo, hi in _ZONE_DEFS:
        if lo <= pct <= hi:
            return code
    return "Z1" if pct < 60 else "Z5"


def _prognosis_tss(duration_min: int, zone: str, max_hr: float, threshold_hr: float) -> Decimal:
    """TSS через среднюю точку целевой зоны (прогнозный расчёт для черновиков)."""
    if threshold_hr <= 0 or duration_min <= 0:
        return Decimal("0")
    avg_hr = max_hr * _ZONE_MIDPOINTS[zone] / 100
    intensity_factor = avg_hr / threshold_hr
    return _dec((duration_min * intensity_factor ** 2 * 100) / 60)


def _compute_workout_tss(
    avg_hr: int | None, duration_min: int | None, threshold_hr: float
) -> float:
    """TSS одной тренировки: (T × IF² × 100) / 60, где IF = ЧСС_ср / ЧССПАНО."""
    if not avg_hr or not duration_min or threshold_hr <= 0:
        return 0.0
    intensity_factor = avg_hr / threshold_hr
    return (duration_min * intensity_factor ** 2 * 100) / 60


def _trailing_run(series: list, predicate: Callable) -> int:
    """Длина активной хвостовой последовательности элементов, удовлетворяющих predicate."""
    count = 0
    for item in reversed(series):
        if predicate(item):
            count += 1
        else:
            break
    return count


def _age(birth_date: date) -> int:
    """Полных лет на сегодняшний день."""
    today = date.today()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


def _dec(value: float, places: int = 2) -> Decimal:
    """Округляет float до нужного числа знаков и возвращает Decimal."""
    return Decimal(str(round(value, places)))


def _zone_total_min(t: ActualTelemetry) -> int:
    """Суммарное время по всем зонам из записи телеметрии (мин)."""
    return (
        (t.hr_zone1_min or 0) + (t.hr_zone2_min or 0) + (t.hr_zone3_min or 0)
        + (t.hr_zone4_min or 0) + (t.hr_zone5_min or 0)
    )


def _tlh_series(
    tlh_by_date: dict[date, TrainingLoadHistory], field: str, today: date, days: int
) -> list[float]:
    """Хронологический ряд значений поля field из training_load_history за последние days дней.

    Дни без записи пропускаются, поэтому длина ряда может быть меньше days.
    Используется при построении _AlertContext.
    """
    return [
        float(getattr(tlh_by_date[today - timedelta(days=i)], field))
        for i in range(days - 1, -1, -1)
        if (today - timedelta(days=i)) in tlh_by_date
    ]


# ═══════════════════════════════════════════════════════════════════════════
# 1. Расчёт зон ЧСС — вспомогательные функции
# ═══════════════════════════════════════════════════════════════════════════

async def _fetch_max_hr(
    athlete_id: uuid.UUID, birth_date: date, db: AsyncSession
) -> tuple[float, str]:
    """Возвращает (ЧССmax, source). Предпочитает measured-маркер; иначе 220 − возраст."""
    res = await db.execute(
        select(PhysiologicalMarker)
        .where(
            PhysiologicalMarker.athlete_id == athlete_id,
            PhysiologicalMarker.max_hr.isnot(None),
            PhysiologicalMarker.source == "measured",
        )
        .order_by(PhysiologicalMarker.date_recorded.desc())
        .limit(1)
    )
    m = res.scalar_one_or_none()
    if m:
        return float(m.max_hr), "measured"
    return float(220 - _age(birth_date)), "formula"


async def _fetch_threshold_hr_for_zones(
    athlete_id: uuid.UUID, db: AsyncSession
) -> float | None:
    """Последний измеренный ЧССПАНО для коррекции границы Z3/Z4 (или None)."""
    res = await db.execute(
        select(PhysiologicalMarker)
        .where(
            PhysiologicalMarker.athlete_id == athlete_id,
            PhysiologicalMarker.threshold_hr.isnot(None),
            PhysiologicalMarker.source == "measured",
        )
        .order_by(PhysiologicalMarker.date_recorded.desc())
        .limit(1)
    )
    m = res.scalar_one_or_none()
    return float(m.threshold_hr) if m else None


def _build_zones(max_hr: float, threshold_hr: float | None) -> list[HRZone]:
    """Строит список HRZone; при наличии threshold_hr сдвигает границу Z3/Z4."""
    zones = []
    for code, label, pct_lo, pct_hi in _ZONE_DEFS:
        hr_min = round(max_hr * pct_lo / 100)
        hr_max = round(max_hr * pct_hi / 100)
        if threshold_hr is not None:
            if code == "Z3":
                hr_max = round(threshold_hr)
            elif code == "Z4":
                hr_min = round(threshold_hr)
        zones.append(HRZone(zone=code, label=label, hr_min=hr_min, hr_max=hr_max))
    return zones


# ═══════════════════════════════════════════════════════════════════════════
# 2. Адаптация шаблона — вспомогательные функции
# ═══════════════════════════════════════════════════════════════════════════

class _AthleteParams(NamedTuple):
    kq: float
    kf: float
    max_hr: float
    thr_hr: float
    marker_id: uuid.UUID | None
    duration: int            # итоговая длительность (мин) с учётом ограничений зоны


async def _resolve_athlete_params(
    athlete_id: uuid.UUID, target_zone: str, db: AsyncSession
) -> _AthleteParams | None:
    """Загружает профиль и маркеры атлета; вычисляет k_qual, k_form и scaled duration."""
    profile = await db.get(AthleteProfile, athlete_id)
    if not profile:
        return None

    res_m = await db.execute(
        select(PhysiologicalMarker)
        .where(PhysiologicalMarker.athlete_id == athlete_id)
        .order_by(PhysiologicalMarker.date_recorded.desc())
        .limit(1)
    )
    marker = res_m.scalar_one_or_none()

    res_tlh = await db.execute(
        select(TrainingLoadHistory)
        .where(TrainingLoadHistory.athlete_id == athlete_id)
        .order_by(TrainingLoadHistory.date.desc())
        .limit(1)
    )
    tlh = res_tlh.scalar_one_or_none()

    kq = _k_qual(profile.qualification)
    kf = _k_form(float(tlh.tsb) if tlh else 0.0)
    max_hr = float(marker.max_hr) if marker and marker.max_hr else float(220 - _age(profile.birth_date))
    thr_hr = float(marker.threshold_hr) if marker and marker.threshold_hr else max_hr * 0.87
    duration = max(min(round(60 * kq * kf), _ZONE_MAX_MIN[target_zone]), 20)

    return _AthleteParams(
        kq=kq, kf=kf, max_hr=max_hr, thr_hr=thr_hr,
        marker_id=marker.id if marker else None,
        duration=duration,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 3. Индексы нагрузки — вспомогательные функции
# ═══════════════════════════════════════════════════════════════════════════

async def _resolve_threshold_hr(athlete_id: uuid.UUID, db: AsyncSession) -> float:
    """ЧССПАНО из маркера → 87% ЧССmax → 87% от (220 − возраст)."""
    res = await db.execute(
        select(PhysiologicalMarker)
        .where(PhysiologicalMarker.athlete_id == athlete_id)
        .order_by(PhysiologicalMarker.date_recorded.desc())
        .limit(1)
    )
    m = res.scalar_one_or_none()
    if m and m.threshold_hr:
        return float(m.threshold_hr)
    if m and m.max_hr:
        return float(m.max_hr) * 0.87
    profile = await db.get(AthleteProfile, athlete_id)
    return (220 - _age(profile.birth_date)) * 0.87


async def _aggregate_daily_tss(
    athlete_id: uuid.UUID, workout_date: date, db: AsyncSession
) -> float:
    """Суммирует actual_tss всех тренировок атлета за указанный день.

    Вызывается после db.flush(), поэтому включает только что записанный TSS
    текущей тренировки.
    """
    res = await db.execute(
        select(ActualTelemetry)
        .join(IndividualWorkout, ActualTelemetry.workout_id == IndividualWorkout.id)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.planned_date == workout_date,
        )
    )
    return sum(float(t.actual_tss) for t in res.scalars().all() if t.actual_tss is not None)


async def _upsert_load_history(
    athlete_id: uuid.UUID,
    workout_date: date,
    daily_tss: float,
    prev_atl: float,
    prev_ctl: float,
    db: AsyncSession,
) -> None:
    """Создаёт или обновляет запись training_load_history за указанный день."""
    new_atl = prev_atl + (daily_tss - prev_atl) / 7
    new_ctl = prev_ctl + (daily_tss - prev_ctl) / 42
    new_tsb = prev_ctl - prev_atl          # TSB = CTL_(n-1) − ATL_(n-1)

    res = await db.execute(
        select(TrainingLoadHistory).where(
            TrainingLoadHistory.athlete_id == athlete_id,
            TrainingLoadHistory.date == workout_date,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        existing.daily_tss = _dec(daily_tss)
        existing.atl_7d    = _dec(new_atl)
        existing.ctl_42d   = _dec(new_ctl)
        existing.tsb       = _dec(new_tsb)
    else:
        db.add(TrainingLoadHistory(
            athlete_id=athlete_id,
            date=workout_date,
            daily_tss=_dec(daily_tss),
            atl_7d=_dec(new_atl),
            ctl_42d=_dec(new_ctl),
            tsb=_dec(new_tsb),
        ))


# ═══════════════════════════════════════════════════════════════════════════
# 4. Алерты — контекст данных
# ═══════════════════════════════════════════════════════════════════════════

@dataclass(slots=True)
class _AlertContext:
    """Срез данных атлета за скользящее окно, необходимый для проверки всех правил."""
    athlete_id:      uuid.UUID
    today:           date
    tlh_by_date:     dict[date, TrainingLoadHistory]
    tlh_rows:        list[TrainingLoadHistory]      # 56 дней, хронологически
    tsb_series:      list[float]                   # значения TSB за 14 дней
    ctl14:           list[float]                   # значения CTL за 14 дней
    subj_by_date:    dict[date, SubjectiveMetric]  # 28 дней
    pm_rows:         list[PhysiologicalMarker]     # 30 дней
    tel7:            list[ActualTelemetry]         # телеметрия за 7 дней
    tel28:           list[ActualTelemetry]         # телеметрия за 28 дней
    hrv_base_marker: PhysiologicalMarker | None


async def _fetch_athlete_telemetry(
    athlete_id: uuid.UUID, days: int, db: AsyncSession
) -> list[ActualTelemetry]:
    """Телеметрия атлета за последние days дней (по planned_date тренировки)."""
    r = await db.execute(
        select(ActualTelemetry)
        .join(IndividualWorkout, ActualTelemetry.workout_id == IndividualWorkout.id)
        .where(
            IndividualWorkout.athlete_id == athlete_id,
            IndividualWorkout.planned_date >= date.today() - timedelta(days=days),
        )
    )
    return list(r.scalars().all())


async def _load_alert_context(
    athlete_id: uuid.UUID, today: date, db: AsyncSession
) -> _AlertContext:
    """Единственное место загрузки данных для всех правил алертов."""
    res_tlh = await db.execute(
        select(TrainingLoadHistory)
        .where(
            TrainingLoadHistory.athlete_id == athlete_id,
            TrainingLoadHistory.date >= today - timedelta(days=56),
        )
        .order_by(TrainingLoadHistory.date.asc())
    )
    tlh_rows = list(res_tlh.scalars().all())
    tlh_by_date = {r.date: r for r in tlh_rows}

    res_subj = await db.execute(
        select(SubjectiveMetric)
        .where(
            SubjectiveMetric.athlete_id == athlete_id,
            SubjectiveMetric.date_recorded >= today - timedelta(days=28),
        )
        .order_by(SubjectiveMetric.date_recorded.asc())
    )
    subj_by_date = {r.date_recorded: r for r in res_subj.scalars().all()}

    res_pm = await db.execute(
        select(PhysiologicalMarker)
        .where(
            PhysiologicalMarker.athlete_id == athlete_id,
            PhysiologicalMarker.date_recorded >= today - timedelta(days=30),
        )
        .order_by(PhysiologicalMarker.date_recorded.asc())
    )
    pm_rows = list(res_pm.scalars().all())

    res_hrv = await db.execute(
        select(PhysiologicalMarker)
        .where(
            PhysiologicalMarker.athlete_id == athlete_id,
            PhysiologicalMarker.hrv_baseline.isnot(None),
        )
        .order_by(PhysiologicalMarker.date_recorded.desc())
        .limit(1)
    )

    return _AlertContext(
        athlete_id=athlete_id,
        today=today,
        tlh_by_date=tlh_by_date,
        tlh_rows=tlh_rows,
        tsb_series=_tlh_series(tlh_by_date, "tsb", today, 14),
        ctl14=_tlh_series(tlh_by_date, "ctl_42d", today, 14),
        subj_by_date=subj_by_date,
        pm_rows=pm_rows,
        tel7=await _fetch_athlete_telemetry(athlete_id, 7, db),
        tel28=await _fetch_athlete_telemetry(athlete_id, 28, db),
        hrv_base_marker=res_hrv.scalar_one_or_none(),
    )


# ═══════════════════════════════════════════════════════════════════════════
# 4. Алерты — правила (по одной функции на правило, OCP)
# ═══════════════════════════════════════════════════════════════════════════

# Тип результата одного правила: (код, серьёзность, сообщение) или None
_Condition = tuple[str, str, str]


def _check_p1(ctx: _AlertContext) -> _Condition | None:
    """П1: TSB < порога три и более дней подряд → critical."""
    n = _trailing_run(ctx.tsb_series, lambda v: v < settings.ALERT_OVERLOAD_TSB_THRESHOLD)
    if n >= 3:
        return ("П1", "critical",
                f"TSB < {settings.ALERT_OVERLOAD_TSB_THRESHOLD:.0f} "
                f"на протяжении {n} дней подряд")
    return None


def _check_p2(ctx: _AlertContext) -> _Condition | None:
    """П2: ЧСС покоя > 7% от 14-дневной нормы → warning."""
    pm14 = [r for r in ctx.pm_rows
            if r.resting_hr is not None
            and r.date_recorded >= ctx.today - timedelta(days=14)]
    if len(pm14) < 2:
        return None
    baseline = sum(float(r.resting_hr) for r in pm14[:-1]) / len(pm14[:-1])
    latest = float(pm14[-1].resting_hr)
    limit = baseline * (1 + settings.ALERT_OVERLOAD_RESTING_HR_PCT / 100)
    if baseline > 0 and latest > limit:
        return ("П2", "warning",
                f"ЧСС покоя ({latest:.0f}) превышает 14-дневную норму ({baseline:.0f}) "
                f"более чем на {settings.ALERT_OVERLOAD_RESTING_HR_PCT:.0f}%")
    return None


def _check_p3(ctx: _AlertContext) -> _Condition | None:
    """П3: средний HRV за 7 дней < 85% от базового → warning."""
    m = ctx.hrv_base_marker
    if not m or not m.hrv_baseline:
        return None
    hrv_vals = [
        float(ctx.subj_by_date[ctx.today - timedelta(days=i)].hrv_value)
        for i in range(6, -1, -1)
        if (ctx.today - timedelta(days=i)) in ctx.subj_by_date
        and ctx.subj_by_date[ctx.today - timedelta(days=i)].hrv_value is not None
    ]
    if not hrv_vals:
        return None
    avg = sum(hrv_vals) / len(hrv_vals)
    baseline = float(m.hrv_baseline)
    if avg < baseline * (settings.ALERT_OVERLOAD_HRV_PCT / 100):
        return ("П3", "warning",
                f"Средний HRV за 7 дней ({avg:.0f}) ниже "
                f"{settings.ALERT_OVERLOAD_HRV_PCT:.0f}% от базового ({baseline:.0f})")
    return None


def _check_p4(ctx: _AlertContext) -> _Condition | None:
    """П4: усталость ≥ 4 И качество сна ≤ 2 три дня подряд → warning."""
    pairs = [
        (ctx.subj_by_date[ctx.today - timedelta(days=i)].fatigue_level or 0,
         ctx.subj_by_date[ctx.today - timedelta(days=i)].sleep_quality or 99)
        for i in range(13, -1, -1)
        if (ctx.today - timedelta(days=i)) in ctx.subj_by_date
    ]
    if _trailing_run(pairs, lambda v: v[0] >= 4 and v[1] <= 2) >= 3:
        return ("П4", "warning", "Усталость ≥ 4 и качество сна ≤ 2 три дня подряд")
    return None


def _check_p5(ctx: _AlertContext) -> _Condition | None:
    """П5: доля Z4+Z5 за неделю > 20% → info."""
    total = sum(_zone_total_min(t) for t in ctx.tel7)
    high  = sum((t.hr_zone4_min or 0) + (t.hr_zone5_min or 0) for t in ctx.tel7)
    if total > 0 and high / total > 0.20:
        return ("П5", "info",
                f"Доля Z4+Z5 за неделю: {high / total * 100:.1f}% (норма ≤ 20%)")
    return None


def _check_h1(ctx: _AlertContext) -> _Condition | None:
    """Н1: изменение CTL за 14 дней < порога → info."""
    if len(ctx.ctl14) < 2:
        return None
    delta = abs(ctx.ctl14[-1] - ctx.ctl14[0])
    if delta < settings.ALERT_UNDERLOAD_CTL_DELTA:
        return ("Н1", "info",
                f"CTL изменился на {delta:.2f} за 14 дней "
                f"(норма ≥ {settings.ALERT_UNDERLOAD_CTL_DELTA})")
    return None


def _check_h2(ctx: _AlertContext) -> _Condition | None:
    """Н2: TSB > порога семь и более дней подряд → info."""
    n = _trailing_run(ctx.tsb_series, lambda v: v > settings.ALERT_UNDERLOAD_TSB_HIGH)
    if n >= 7:
        return ("Н2", "info",
                f"TSB > {settings.ALERT_UNDERLOAD_TSB_HIGH:.0f} "
                f"на протяжении {n} дней подряд")
    return None


def _check_h3(ctx: _AlertContext) -> _Condition | None:
    """Н3: TSS за неделю < 50% среднего за 8 недель → warning."""
    tss_week = sum(float(r.daily_tss) for r in ctx.tlh_rows
                   if r.date >= ctx.today - timedelta(days=7))
    tss_all  = sum(float(r.daily_tss) for r in ctx.tlh_rows)
    weeks    = max(1, min(8, len(ctx.tlh_rows) // 7))
    avg_weekly = tss_all / weeks
    if avg_weekly > 0 and tss_week < avg_weekly * 0.50:
        return ("Н3", "warning",
                f"TSS за неделю ({tss_week:.0f}) < 50% "
                f"от средненедельного ({avg_weekly:.0f})")
    return None


def _check_h4(ctx: _AlertContext) -> _Condition | None:
    """Н4: ЧСС покоя снизился > 5% за 30 дней И стагнирует CTL → info."""
    # Условие Н1 проверяется внутри — Н4 независим от факта срабатывания Н1
    if len(ctx.ctl14) < 2 or abs(ctx.ctl14[-1] - ctx.ctl14[0]) >= settings.ALERT_UNDERLOAD_CTL_DELTA:
        return None
    pm_hr = [r for r in ctx.pm_rows if r.resting_hr is not None]
    if len(pm_hr) < 2:
        return None
    oldest, newest = float(pm_hr[0].resting_hr), float(pm_hr[-1].resting_hr)
    if oldest > 0 and newest < oldest * 0.95:
        return ("Н4", "info",
                f"ЧСС покоя снизился > 5% за 30 дней ({oldest:.0f} → {newest:.0f}) "
                f"при стагнации CTL")
    return None


def _check_h5(ctx: _AlertContext) -> _Condition | None:
    """Н5: доля Z1+Z2 за 4 недели < 75% → info."""
    total = sum(_zone_total_min(t) for t in ctx.tel28)
    low   = sum((t.hr_zone1_min or 0) + (t.hr_zone2_min or 0) for t in ctx.tel28)
    if total > 0 and low / total < 0.75:
        return ("Н5", "info",
                f"Доля Z1+Z2 за 4 недели: {low / total * 100:.1f}% (норма ≥ 75%)")
    return None


# Реестр правил: добавление нового правила не требует изменения generate_alerts
_ALERT_RULES: list[Callable[[_AlertContext], _Condition | None]] = [
    _check_p1, _check_p2, _check_p3, _check_p4, _check_p5,
    _check_h1, _check_h2, _check_h3, _check_h4, _check_h5,
]


# ═══════════════════════════════════════════════════════════════════════════
# 4. Алерты — сохранение
# ═══════════════════════════════════════════════════════════════════════════

async def _persist_new_alerts(
    db: AsyncSession,
    athlete_id: uuid.UUID,
    conditions: list[_Condition],
    workout_id: uuid.UUID | None,
    subjective_id: uuid.UUID | None,
) -> list[DiagnosticAlert]:
    """Сохраняет алерты из списка условий, пропуская уже активные (без дублей)."""
    new_alerts: list[DiagnosticAlert] = []
    for rule_code, severity, message in conditions:
        res = await db.execute(
            select(DiagnosticAlert).where(
                DiagnosticAlert.athlete_id == athlete_id,
                DiagnosticAlert.rule_code == rule_code,
                DiagnosticAlert.is_resolved == False,
            )
        )
        if res.scalar_one_or_none():
            continue
        alert = DiagnosticAlert(
            athlete_id=athlete_id,
            rule_code=rule_code,
            severity=severity,
            message=message,
            triggered_by_workout_id=workout_id,
            triggered_by_subjective_id=subjective_id,
            is_resolved=False,
        )
        db.add(alert)
        new_alerts.append(alert)
    return new_alerts


# ═══════════════════════════════════════════════════════════════════════════
# Публичные функции
# ═══════════════════════════════════════════════════════════════════════════

async def calculate_hr_zones(athlete_id: uuid.UUID, db: AsyncSession) -> HRZonesResponse:
    """Рассчитывает пульсовые зоны Z1–Z5 атлета по шкале Olympiatoppen.

    Алгоритм:
        1. Ищет последний measured physiological_marker с max_hr.
           При отсутствии применяет формулу 220 − возраст (source='formula').
        2. Ищет последний measured threshold_hr для коррекции границы Z3/Z4:
           верхняя граница Z3 и нижняя граница Z4 устанавливаются в значение ЧССПАНО.
        3. Строит пять зон по процентным диапазонам Olympiatoppen.

    Параметры:
        athlete_id: UUID профиля атлета.
        db: асинхронная сессия SQLAlchemy.

    Возвращает:
        HRZonesResponse с полями max_hr, source и списком из пяти HRZone.

    Исключения:
        ValueError — если профиль атлета не найден.
    """
    profile = await db.get(AthleteProfile, athlete_id)
    if not profile:
        raise ValueError(f"Атлет {athlete_id} не найден")

    max_hr, source = await _fetch_max_hr(athlete_id, profile.birth_date, db)
    threshold_hr   = await _fetch_threshold_hr_for_zones(athlete_id, db)
    zones          = _build_zones(max_hr, threshold_hr)

    return HRZonesResponse(athlete_id=athlete_id, max_hr=round(max_hr), source=source, zones=zones)


async def adapt_template(template_id: uuid.UUID, db: AsyncSession) -> list[uuid.UUID]:
    """Адаптирует групповой шаблон для каждого атлета по формуле T_ind = T_base × k_qual × k_form.

    Алгоритм:
        1. Загружает шаблон и список активных участников группы.
        2. Для каждого атлета вычисляет k_qual (по квалификации) и k_form (по TSB).
        3. Масштабирует базовую длительность (60 мин) с ограничением по зоне.
        4. Рассчитывает прогнозный TSS через среднюю точку целевой зоны.
        5. Создаёт IndividualWorkout(status='draft') на каждый день микроцикла.

    Параметры:
        template_id: UUID шаблона плана.
        db: асинхронная сессия SQLAlchemy.

    Возвращает:
        Список UUID созданных черновых тренировок.

    Исключения:
        ValueError — если шаблон не найден.
    """
    template = await db.get(PlanTemplate, template_id)
    if not template:
        raise ValueError(f"Шаблон {template_id} не найден")

    res = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == template.group_id,
            GroupMembership.is_active == True,
        )
    )
    memberships = res.scalars().all()
    if not memberships:
        return []

    _CYCLIC = frozenset({"ski", "skiroll", "run", "bike"})

    default_zone = _zone_for_pct(float(template.target_intensity_pct or 75))
    schedule: list[dict] = template.week_schedule or [
        {"workout_type": "run", "zone": default_zone, "duration_min": 60}
    ] * 7

    created_ids: list[uuid.UUID] = []

    for membership in memberships:
        for day_offset in range(template.duration_days):
            day_cfg = schedule[day_offset % 7]
            w_type = day_cfg.get("workout_type") or "run"

            if w_type == "rest":
                continue

            is_cyclic = w_type in _CYCLIC
            interval_structure = day_cfg.get("interval_structure") or []
            w_id = uuid.uuid4()

            if is_cyclic:
                if interval_structure:
                    work_segs = [s for s in interval_structure if s.get("seg_type") == "work"]
                    zone = work_segs[0]["zone"] if work_segs else day_cfg.get("zone", default_zone)
                    duration = sum(
                        s.get("duration_min", 0) * s.get("repeats", 1)
                        for s in interval_structure
                    )
                else:
                    zone = day_cfg.get("zone", default_zone)
                    base_dur = int(day_cfg.get("duration_min") or 60)
                    params_scale = await _resolve_athlete_params(membership.athlete_id, zone, db)
                    if params_scale is None:
                        continue
                    duration = max(
                        min(round(base_dur * params_scale.kq * params_scale.kf),
                            _ZONE_MAX_MIN.get(zone, 240)),
                        20,
                    )

                params = await _resolve_athlete_params(membership.athlete_id, zone, db)
                if params is None:
                    continue
                planned_tss = _prognosis_tss(duration, zone, params.max_hr, params.thr_hr)

                db.add(IndividualWorkout(
                    id=w_id,
                    template_id=template.id,
                    athlete_id=membership.athlete_id,
                    marker_id_used=params.marker_id,
                    planned_date=template.start_date + timedelta(days=day_offset),
                    planned_duration_min=duration,
                    planned_tss=planned_tss,
                    k_qual=_dec(params.kq, 3),
                    k_form=_dec(params.kf, 3),
                    target_zone=zone,
                    workout_type=w_type,
                    workout_subtype=day_cfg.get("workout_subtype"),
                    description=day_cfg.get("description"),
                    interval_structure=interval_structure or None,
                    status="draft",
                ))
            else:
                dur = int(day_cfg.get("duration_min") or 0) or None
                db.add(IndividualWorkout(
                    id=w_id,
                    template_id=template.id,
                    athlete_id=membership.athlete_id,
                    marker_id_used=None,
                    planned_date=template.start_date + timedelta(days=day_offset),
                    planned_duration_min=dur,
                    planned_tss=None,
                    k_qual=None,
                    k_form=None,
                    target_zone=None,
                    workout_type=w_type,
                    workout_subtype=day_cfg.get("workout_subtype"),
                    description=day_cfg.get("description"),
                    interval_structure=None,
                    status="draft",
                ))

            created_ids.append(w_id)

    await db.commit()
    return created_ids


async def calculate_load_indexes(
    athlete_id: uuid.UUID, workout_id: uuid.UUID, db: AsyncSession
) -> None:
    """Вычисляет TSS по телеметрии и обновляет ATL/CTL/TSB в training_load_history.

    Формулы:
        IF  = ЧСС_средняя / ЧССПАНО
        TSS = (T_мин × IF² × 100) / 60
        ATLₙ = ATL₍ₙ₋₁₎ + (TSS_день − ATL₍ₙ₋₁₎) / 7
        CTLₙ = CTL₍ₙ₋₁₎ + (TSS_день − CTL₍ₙ₋₁₎) / 42
        TSBₙ = CTL₍ₙ₋₁₎ − ATL₍ₙ₋₁₎

    При нескольких тренировках за день TSS суммируются. ЧССПАНО берётся
    из последнего physiological_marker; при отсутствии — 87% ЧССmax.

    Параметры:
        athlete_id: UUID профиля атлета.
        workout_id: UUID тренировки с сохранённой actual_telemetry.
        db: асинхронная сессия SQLAlchemy.

    Исключения:
        ValueError — если тренировка или телеметрия не найдена.
    """
    workout = await db.get(IndividualWorkout, workout_id)
    if not workout:
        raise ValueError(f"Тренировка {workout_id} не найдена")

    res_tel = await db.execute(
        select(ActualTelemetry).where(ActualTelemetry.workout_id == workout_id)
    )
    tel = res_tel.scalar_one_or_none()
    if not tel:
        raise ValueError(f"Телеметрия для тренировки {workout_id} не найдена")

    threshold_hr  = await _resolve_threshold_hr(athlete_id, db)
    tss_this      = _compute_workout_tss(tel.avg_hr, tel.actual_duration_min, threshold_hr)
    tel.actual_tss = _dec(tss_this)

    # flush обеспечивает видимость actual_tss в агрегирующем запросе ниже
    await db.flush()
    daily_tss = await _aggregate_daily_tss(athlete_id, workout.planned_date, db)

    res_prev = await db.execute(
        select(TrainingLoadHistory)
        .where(
            TrainingLoadHistory.athlete_id == athlete_id,
            TrainingLoadHistory.date < workout.planned_date,
        )
        .order_by(TrainingLoadHistory.date.desc())
        .limit(1)
    )
    prev = res_prev.scalar_one_or_none()
    await _upsert_load_history(
        athlete_id, workout.planned_date, daily_tss,
        prev_atl=float(prev.atl_7d)  if prev else 0.0,
        prev_ctl=float(prev.ctl_42d) if prev else 0.0,
        db=db,
    )
    await db.commit()


async def generate_alerts(
    athlete_id: uuid.UUID,
    db: AsyncSession,
    triggered_by_workout_id: uuid.UUID | None = None,
    triggered_by_subjective_id: uuid.UUID | None = None,
) -> list[AlertRead]:
    """Проверяет 10 правил диагностики и сохраняет новые алерты в diagnostic_alerts.

    Правила перегрузки П1–П5 и недогруза Н1–Н5 применяются к данным за
    последние 56 дней. Повторный алерт не создаётся, пока существующий
    с тем же rule_code не будет помечен is_resolved=True.

    Для добавления нового правила достаточно написать функцию
    (_AlertContext) → _Condition | None и добавить её в _ALERT_RULES.

    Параметры:
        athlete_id: UUID профиля атлета.
        db: асинхронная сессия SQLAlchemy.
        triggered_by_workout_id: UUID тренировки-триггера (опционально).
        triggered_by_subjective_id: UUID субъективных метрик-триггера (опционально).

    Возвращает:
        Список AlertRead для каждого нового сохранённого алерта.
    """
    ctx = await _load_alert_context(athlete_id, date.today(), db)
    conditions = [c for rule in _ALERT_RULES if (c := rule(ctx)) is not None]
    new_alerts = await _persist_new_alerts(
        db, athlete_id, conditions, triggered_by_workout_id, triggered_by_subjective_id,
    )
    if new_alerts:
        await db.flush()
        for a in new_alerts:
            await db.refresh(a)
    await db.commit()
    return [AlertRead.model_validate(a) for a in new_alerts]
