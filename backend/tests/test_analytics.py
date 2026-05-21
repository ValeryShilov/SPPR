"""Тесты аналитического ядра СППР.

Tier 1 — чистые юнит-тесты (без БД):
    TestKQual / TestKForm     — коэффициенты k_qual, k_form
    TestCheckP1..P5           — правила перегрузки
    TestCheckH1..H5           — правила недогруза

Tier 2 — интеграционные тесты (PostgreSQL):
    TestCalculateHRZones      — расчёт зон ЧСС
    TestAdaptTemplate         — адаптация шаблона
    TestCalculateLoadIndexes  — индексы нагрузки TSS/ATL/CTL/TSB
    TestGenerateAlerts        — сохранение алертов и дедупликация
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from backend.core.config import settings
from backend.models.athlete import PhysiologicalMarker, TrainingLoadHistory
from backend.models.group import GroupMembership
from backend.models.plan import IndividualWorkout
from backend.services.analytics import (
    _AlertContext,
    _check_h1,
    _check_h2,
    _check_h3,
    _check_h4,
    _check_h5,
    _check_p1,
    _check_p2,
    _check_p3,
    _check_p4,
    _check_p5,
    _k_form,
    _k_qual,
    adapt_template,
    calculate_hr_zones,
    calculate_load_indexes,
    generate_alerts,
)


# ═══════════════════════════════════════════════════════════════════════════
# Вспомогательные фабрики для юнит-тестов (без БД)
# ═══════════════════════════════════════════════════════════════════════════

TODAY = date.today()


def make_pm(
    resting_hr: int | None = None,
    hrv_baseline: int | None = None,
    date_offset: int = 0,
) -> SimpleNamespace:
    """Заглушка PhysiologicalMarker с нужными полями."""
    return SimpleNamespace(
        resting_hr=resting_hr,
        hrv_baseline=hrv_baseline,
        date_recorded=TODAY - timedelta(days=date_offset),
    )


def make_subj(
    fatigue_level: int | None = None,
    sleep_quality: int | None = None,
    hrv_value: int | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        fatigue_level=fatigue_level,
        sleep_quality=sleep_quality,
        hrv_value=hrv_value,
    )


def make_tel(
    z1: int = 0, z2: int = 0, z3: int = 0, z4: int = 0, z5: int = 0
) -> SimpleNamespace:
    return SimpleNamespace(
        hr_zone1_min=z1,
        hr_zone2_min=z2,
        hr_zone3_min=z3,
        hr_zone4_min=z4,
        hr_zone5_min=z5,
    )


def make_tlh_row(d: date, daily_tss: float) -> SimpleNamespace:
    return SimpleNamespace(date=d, daily_tss=Decimal(str(daily_tss)))


def make_ctx(**kwargs) -> _AlertContext:
    """Строит _AlertContext с разумными значениями по умолчанию."""
    defaults: dict = {
        "athlete_id": uuid.uuid4(),
        "today": TODAY,
        "tlh_by_date": {},
        "tlh_rows": [],
        "tsb_series": [],
        "ctl14": [],
        "subj_by_date": {},
        "pm_rows": [],
        "tel7": [],
        "tel28": [],
        "hrv_base_marker": None,
    }
    defaults.update(kwargs)
    return _AlertContext(**defaults)


# ═══════════════════════════════════════════════════════════════════════════
# Tier 1 — чистые вычислительные функции
# ═══════════════════════════════════════════════════════════════════════════


class TestKQual:
    def test_ms(self):
        assert _k_qual("МС") == 1.20

    def test_msmk(self):
        assert _k_qual("МСМК") == 1.20

    def test_kms(self):
        assert _k_qual("КМС") == 1.10

    def test_first_rank(self):
        assert _k_qual("I разряд") == 1.00

    def test_second_rank(self):
        assert _k_qual("II разряд") == 0.85

    def test_third_rank(self):
        assert _k_qual("III разряд") == 0.85

    def test_none_returns_default(self):
        assert _k_qual(None) == 0.70

    def test_empty_returns_default(self):
        assert _k_qual("") == 0.70

    def test_first_rank_not_confused_with_second(self):
        # «I разряд» должен давать 1.0, не путать с «II»
        assert _k_qual("I разряд") == 1.00


class TestKForm:
    def test_good_form_high_tsb(self):
        assert _k_form(10.0) == 1.05

    def test_good_form_boundary(self):
        assert _k_form(5.01) == 1.05

    def test_neutral_tsb_zero(self):
        assert _k_form(0.0) == 1.00

    def test_neutral_tsb_boundary(self):
        assert _k_form(5.0) == 1.00  # не строго > 5

    def test_mild_fatigue(self):
        assert _k_form(-15.0) == 0.90

    def test_mild_fatigue_boundary(self):
        assert _k_form(-10.0) == 1.00  # ≥ -10 → 1.00

    def test_deep_fatigue(self):
        assert _k_form(-30.0) == 0.75

    def test_deep_fatigue_boundary(self):
        assert _k_form(-25.0) == 0.90  # ≥ -25 → 0.90


# ═══════════════════════════════════════════════════════════════════════════
# Правила перегрузки П1–П5
# ═══════════════════════════════════════════════════════════════════════════


class TestCheckP1:
    """П1: TSB < порога три и более дней подряд → critical."""

    _THRESH = settings.ALERT_OVERLOAD_TSB_THRESHOLD  # -30

    def test_fires_exactly_3_days(self):
        ctx = make_ctx(tsb_series=[self._THRESH - 1] * 3)
        result = _check_p1(ctx)
        assert result is not None
        assert result[0] == "П1"
        assert result[1] == "critical"

    def test_fires_more_than_3_days(self):
        ctx = make_ctx(tsb_series=[self._THRESH - 5] * 7)
        result = _check_p1(ctx)
        assert result is not None
        assert result[0] == "П1"

    def test_not_fires_only_2_days(self):
        ctx = make_ctx(tsb_series=[self._THRESH - 1, self._THRESH - 1, 0.0])
        assert _check_p1(ctx) is None

    def test_not_fires_empty_series(self):
        ctx = make_ctx(tsb_series=[])
        assert _check_p1(ctx) is None

    def test_not_fires_all_above_threshold(self):
        ctx = make_ctx(tsb_series=[10.0, 20.0, 5.0])
        assert _check_p1(ctx) is None


class TestCheckP2:
    """П2: ЧСС покоя > 7% от 14-дневной нормы → warning."""

    _PCT = settings.ALERT_OVERLOAD_RESTING_HR_PCT  # 7.0

    def _make_pm_rows(self, baseline: int, latest: int) -> list:
        """Два маркера: базовый (10 дней назад) и свежий (вчера)."""
        return [
            make_pm(resting_hr=baseline, date_offset=10),
            make_pm(resting_hr=latest, date_offset=1),
        ]

    def test_fires_when_latest_elevated(self):
        # baseline=60, latest=65: 65 > 60*(1+0.07)=64.2
        ctx = make_ctx(pm_rows=self._make_pm_rows(60, 65))
        result = _check_p2(ctx)
        assert result is not None
        assert result[0] == "П2"
        assert result[1] == "warning"

    def test_not_fires_when_latest_normal(self):
        # baseline=60, latest=62: 62 < 64.2
        ctx = make_ctx(pm_rows=self._make_pm_rows(60, 62))
        assert _check_p2(ctx) is None

    def test_not_fires_with_single_record(self):
        ctx = make_ctx(pm_rows=[make_pm(resting_hr=60, date_offset=1)])
        assert _check_p2(ctx) is None

    def test_not_fires_with_no_resting_hr(self):
        ctx = make_ctx(pm_rows=[make_pm(date_offset=5), make_pm(date_offset=1)])
        assert _check_p2(ctx) is None

    def test_not_fires_when_record_older_than_14_days(self):
        # оба маркера старше 14 дней — не попадают в pm14
        ctx = make_ctx(pm_rows=[
            make_pm(resting_hr=60, date_offset=20),
            make_pm(resting_hr=70, date_offset=15),
        ])
        assert _check_p2(ctx) is None


class TestCheckP3:
    """П3: средний HRV 7 дней < 85% от базового → warning."""

    _PCT = settings.ALERT_OVERLOAD_HRV_PCT  # 85

    def test_fires_when_hrv_low(self):
        # baseline=100, avg=70 < 85% → trigger
        hrv_marker = make_pm(hrv_baseline=100)
        subj = {TODAY: make_subj(hrv_value=70)}
        ctx = make_ctx(hrv_base_marker=hrv_marker, subj_by_date=subj)
        result = _check_p3(ctx)
        assert result is not None
        assert result[0] == "П3"
        assert result[1] == "warning"

    def test_not_fires_without_baseline_marker(self):
        subj = {TODAY: make_subj(hrv_value=70)}
        ctx = make_ctx(hrv_base_marker=None, subj_by_date=subj)
        assert _check_p3(ctx) is None

    def test_not_fires_when_hrv_normal(self):
        # baseline=100, avg=90 ≥ 85% → no trigger
        hrv_marker = make_pm(hrv_baseline=100)
        subj = {TODAY: make_subj(hrv_value=90)}
        ctx = make_ctx(hrv_base_marker=hrv_marker, subj_by_date=subj)
        assert _check_p3(ctx) is None

    def test_not_fires_without_subj_data(self):
        hrv_marker = make_pm(hrv_baseline=100)
        ctx = make_ctx(hrv_base_marker=hrv_marker, subj_by_date={})
        assert _check_p3(ctx) is None

    def test_fires_uses_7day_average(self):
        # 7 значений: 3 нормальных + 3 низких → средняя ниже 85
        hrv_marker = make_pm(hrv_baseline=100)
        subj = {TODAY - timedelta(days=i): make_subj(hrv_value=60) for i in range(7)}
        ctx = make_ctx(hrv_base_marker=hrv_marker, subj_by_date=subj)
        result = _check_p3(ctx)
        assert result is not None


class TestCheckP4:
    """П4: усталость ≥ 4 И сон ≤ 2 три дня подряд → warning."""

    def _bad_day(self) -> SimpleNamespace:
        return make_subj(fatigue_level=5, sleep_quality=1)

    def _ok_day(self) -> SimpleNamespace:
        return make_subj(fatigue_level=2, sleep_quality=4)

    def test_fires_exactly_3_days(self):
        subj = {TODAY - timedelta(days=i): self._bad_day() for i in range(3)}
        ctx = make_ctx(subj_by_date=subj)
        result = _check_p4(ctx)
        assert result is not None
        assert result[0] == "П4"
        assert result[1] == "warning"

    def test_not_fires_only_2_consecutive_days(self):
        subj = {
            TODAY - timedelta(days=2): self._ok_day(),
            TODAY - timedelta(days=1): self._bad_day(),
            TODAY: self._bad_day(),
        }
        ctx = make_ctx(subj_by_date=subj)
        assert _check_p4(ctx) is None

    def test_not_fires_when_broken_run(self):
        subj = {
            TODAY - timedelta(days=3): self._bad_day(),
            TODAY - timedelta(days=2): self._ok_day(),  # разрыв
            TODAY - timedelta(days=1): self._bad_day(),
            TODAY: self._bad_day(),
        }
        ctx = make_ctx(subj_by_date=subj)
        assert _check_p4(ctx) is None

    def test_not_fires_empty(self):
        ctx = make_ctx(subj_by_date={})
        assert _check_p4(ctx) is None


class TestCheckP5:
    """П5: доля Z4+Z5 за неделю > 20% → info."""

    def test_fires_high_intensity(self):
        # total=100, high=25 → 25% > 20%
        ctx = make_ctx(tel7=[make_tel(z1=30, z2=30, z3=15, z4=15, z5=10)])
        result = _check_p5(ctx)
        assert result is not None
        assert result[0] == "П5"
        assert result[1] == "info"

    def test_not_fires_normal_distribution(self):
        # total=100, high=15 → 15% ≤ 20%
        ctx = make_ctx(tel7=[make_tel(z1=40, z2=30, z3=15, z4=10, z5=5)])
        assert _check_p5(ctx) is None

    def test_not_fires_no_telemetry(self):
        ctx = make_ctx(tel7=[])
        assert _check_p5(ctx) is None

    def test_boundary_exactly_20_percent(self):
        # 20/100 = 20%, условие > 20%, не срабатывает
        ctx = make_ctx(tel7=[make_tel(z1=40, z2=40, z3=0, z4=10, z5=10)])
        assert _check_p5(ctx) is None


# ═══════════════════════════════════════════════════════════════════════════
# Правила недогруза Н1–Н5
# ═══════════════════════════════════════════════════════════════════════════


class TestCheckH1:
    """Н1: изменение CTL за 14 дней < порога → info."""

    _DELTA = settings.ALERT_UNDERLOAD_CTL_DELTA  # 2.0

    def test_fires_when_ctl_stagnates(self):
        ctx = make_ctx(ctl14=[50.0, 50.5])  # delta=0.5 < 2.0
        result = _check_h1(ctx)
        assert result is not None
        assert result[0] == "Н1"
        assert result[1] == "info"

    def test_not_fires_when_ctl_growing(self):
        ctx = make_ctx(ctl14=[50.0, 55.0])  # delta=5.0 ≥ 2.0
        assert _check_h1(ctx) is None

    def test_not_fires_when_ctl_decreasing_enough(self):
        ctx = make_ctx(ctl14=[55.0, 50.0])  # |delta|=5.0 ≥ 2.0
        assert _check_h1(ctx) is None

    def test_not_fires_with_single_point(self):
        ctx = make_ctx(ctl14=[50.0])
        assert _check_h1(ctx) is None

    def test_not_fires_with_empty(self):
        ctx = make_ctx(ctl14=[])
        assert _check_h1(ctx) is None


class TestCheckH2:
    """Н2: TSB > порога семь и более дней подряд → info."""

    _HIGH = settings.ALERT_UNDERLOAD_TSB_HIGH  # 15.0

    def test_fires_exactly_7_days(self):
        ctx = make_ctx(tsb_series=[self._HIGH + 1] * 7)
        result = _check_h2(ctx)
        assert result is not None
        assert result[0] == "Н2"
        assert result[1] == "info"

    def test_not_fires_only_6_consecutive(self):
        # 6 дней подряд TSB > порога — недостаточно, нужно 7
        ctx = make_ctx(tsb_series=[0.0] + [self._HIGH + 1] * 6)
        assert _check_h2(ctx) is None

    def test_not_fires_when_last_day_normal(self):
        series = [self._HIGH + 1] * 7 + [0.0]
        ctx = make_ctx(tsb_series=series)
        assert _check_h2(ctx) is None

    def test_not_fires_empty(self):
        assert _check_h2(make_ctx(tsb_series=[])) is None


class TestCheckH3:
    """Н3: TSS за неделю < 50% средненедельного → warning."""

    def _rows(self, values_old: list[float], values_new: list[float]) -> list:
        """old — более ранние дни, new — 8 дней включая сегодня (≥ today-7)."""
        rows = []
        start_old = len(values_old) + len(values_new) - 1
        for i, v in enumerate(values_old):
            rows.append(make_tlh_row(TODAY - timedelta(days=start_old - i), v))
        start_new = len(values_new) - 1
        for i, v in enumerate(values_new):
            rows.append(make_tlh_row(TODAY - timedelta(days=start_new - i), v))
        return rows

    def test_fires_when_recent_tss_low(self):
        # 6 старых дней TSS=100, 8 новых дней TSS=10
        rows = self._rows([100.0] * 6, [10.0] * 8)
        ctx = make_ctx(tlh_rows=rows)
        result = _check_h3(ctx)
        assert result is not None
        assert result[0] == "Н3"
        assert result[1] == "warning"

    def test_not_fires_when_balanced(self):
        # все 14 дней TSS=100: tss_week ≥ avg_weekly*0.50
        rows = self._rows([], [100.0] * 14)
        ctx = make_ctx(tlh_rows=rows)
        assert _check_h3(ctx) is None

    def test_not_fires_with_no_history(self):
        assert _check_h3(make_ctx(tlh_rows=[])) is None


class TestCheckH4:
    """Н4: ЧСС покоя снизился > 5% за 30 дней + CTL стагнирует → info."""

    _DELTA = settings.ALERT_UNDERLOAD_CTL_DELTA  # 2.0

    def test_fires_when_both_conditions_met(self):
        # CTL стагнирует: delta < 2.0
        ctl14 = [50.0, 50.5]
        # ЧСС снизился > 5%: 63 < 70*0.95 = 66.5
        pm_rows = [make_pm(resting_hr=70, date_offset=25), make_pm(resting_hr=63, date_offset=1)]
        ctx = make_ctx(ctl14=ctl14, pm_rows=pm_rows)
        result = _check_h4(ctx)
        assert result is not None
        assert result[0] == "Н4"
        assert result[1] == "info"

    def test_not_fires_when_ctl_growing(self):
        ctl14 = [50.0, 55.0]  # delta=5 ≥ 2.0 → стагнации нет
        pm_rows = [make_pm(resting_hr=70, date_offset=25), make_pm(resting_hr=63, date_offset=1)]
        ctx = make_ctx(ctl14=ctl14, pm_rows=pm_rows)
        assert _check_h4(ctx) is None

    def test_not_fires_when_hr_stable(self):
        ctl14 = [50.0, 50.5]
        # ЧСС не снизился > 5%: 67 > 70*0.95 = 66.5
        pm_rows = [make_pm(resting_hr=70, date_offset=25), make_pm(resting_hr=67, date_offset=1)]
        ctx = make_ctx(ctl14=ctl14, pm_rows=pm_rows)
        assert _check_h4(ctx) is None

    def test_not_fires_with_single_pm_record(self):
        ctl14 = [50.0, 50.5]
        pm_rows = [make_pm(resting_hr=70, date_offset=1)]
        ctx = make_ctx(ctl14=ctl14, pm_rows=pm_rows)
        assert _check_h4(ctx) is None


class TestCheckH5:
    """Н5: доля Z1+Z2 за 4 недели < 75% → info."""

    def test_fires_when_low_base_zones(self):
        # total=100, low=60 → 60% < 75%
        ctx = make_ctx(tel28=[make_tel(z1=30, z2=30, z3=20, z4=15, z5=5)])
        result = _check_h5(ctx)
        assert result is not None
        assert result[0] == "Н5"
        assert result[1] == "info"

    def test_not_fires_when_base_zones_sufficient(self):
        # total=100, low=80 → 80% ≥ 75%
        ctx = make_ctx(tel28=[make_tel(z1=50, z2=30, z3=10, z4=7, z5=3)])
        assert _check_h5(ctx) is None

    def test_not_fires_no_telemetry(self):
        assert _check_h5(make_ctx(tel28=[])) is None

    def test_boundary_exactly_75_percent(self):
        # 75/100 = 75%, условие < 75%, не срабатывает
        ctx = make_ctx(tel28=[make_tel(z1=50, z2=25, z3=25, z4=0, z5=0)])
        assert _check_h5(ctx) is None


# ═══════════════════════════════════════════════════════════════════════════
# Tier 2 — интеграционные тесты (PostgreSQL)
# ═══════════════════════════════════════════════════════════════════════════


class TestCalculateHRZones:
    """Расчёт пульсовых зон по шкале Olympiatoppen."""

    async def test_returns_5_zones(self, db, athlete_data):
        _, profile = athlete_data
        result = await calculate_hr_zones(profile.id, db)
        assert len(result.zones) == 5

    async def test_zone_codes_in_order(self, db, athlete_data):
        _, profile = athlete_data
        result = await calculate_hr_zones(profile.id, db)
        assert [z.zone for z in result.zones] == ["Z1", "Z2", "Z3", "Z4", "Z5"]

    async def test_uses_formula_when_no_marker(self, db, athlete_data):
        _, profile = athlete_data
        result = await calculate_hr_zones(profile.id, db)
        assert result.source == "formula"
        # 220 − возраст
        today = date.today()
        birth = profile.birth_date
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
        assert result.max_hr == 220 - age

    async def test_uses_measured_max_hr(self, db, athlete_data):
        _, profile = athlete_data
        marker = PhysiologicalMarker(
            id=uuid.uuid4(),
            athlete_id=profile.id,
            date_recorded=date.today(),
            max_hr=195,
            source="measured",
        )
        db.add(marker)
        await db.flush()

        result = await calculate_hr_zones(profile.id, db)
        assert result.source == "measured"
        assert result.max_hr == 195

    async def test_threshold_hr_corrects_z3_z4_boundary(self, db, athlete_data):
        _, profile = athlete_data
        marker = PhysiologicalMarker(
            id=uuid.uuid4(),
            athlete_id=profile.id,
            date_recorded=date.today(),
            max_hr=190,
            threshold_hr=165,
            source="measured",
        )
        db.add(marker)
        await db.flush()

        result = await calculate_hr_zones(profile.id, db)
        z3 = next(z for z in result.zones if z.zone == "Z3")
        z4 = next(z for z in result.zones if z.zone == "Z4")
        assert z3.hr_max == 165
        assert z4.hr_min == 165

    async def test_raises_for_unknown_athlete(self, db):
        with pytest.raises(ValueError):
            await calculate_hr_zones(uuid.uuid4(), db)


class TestAdaptTemplate:
    """Адаптация шаблона: создание черновых IndividualWorkout."""

    async def test_creates_drafts_for_each_day(self, db, template_data):
        template, _ = template_data
        ids = await adapt_template(template.id, db)
        assert len(ids) == template.duration_days  # duration_days=3

    async def test_returned_workouts_are_drafts(self, db, template_data):
        template, _ = template_data
        ids = await adapt_template(template.id, db)
        assert ids

        result = await db.execute(
            select(IndividualWorkout).where(IndividualWorkout.id == ids[0])
        )
        workout = result.scalar_one()
        assert workout.status == "draft"

    async def test_no_members_returns_empty(self, db, template_data):
        template, profile = template_data
        # деактивируем участника
        res = await db.execute(
            select(GroupMembership).where(GroupMembership.athlete_id == profile.id)
        )
        membership = res.scalar_one()
        membership.is_active = False
        await db.flush()

        ids = await adapt_template(template.id, db)
        assert ids == []

    async def test_raises_for_unknown_template(self, db):
        with pytest.raises(ValueError):
            await adapt_template(uuid.uuid4(), db)


class TestCalculateLoadIndexes:
    """TSS / ATL / CTL / TSB из телеметрии тренировки."""

    async def test_first_workout_creates_load_history(self, db, workout_data):
        workout, _ = workout_data
        await calculate_load_indexes(workout.athlete_id, workout.id, db)

        result = await db.execute(
            select(TrainingLoadHistory).where(
                TrainingLoadHistory.athlete_id == workout.athlete_id
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].date == workout.planned_date

    async def test_first_workout_has_zero_prev_atl_ctl(self, db, workout_data):
        workout, _ = workout_data
        await calculate_load_indexes(workout.athlete_id, workout.id, db)

        result = await db.execute(
            select(TrainingLoadHistory).where(
                TrainingLoadHistory.athlete_id == workout.athlete_id
            )
        )
        row = result.scalar_one()
        # при нулевой истории TSB = CTL_prev − ATL_prev = 0 − 0 = 0
        assert float(row.tsb) == 0.0

    async def test_tss_computed_from_telemetry(self, db, workout_data):
        workout, tel = workout_data
        # avg_hr=150, duration=60, threshold_hr ≈ (220-36)*0.87 ≈ 160
        await calculate_load_indexes(workout.athlete_id, workout.id, db)

        result = await db.execute(
            select(TrainingLoadHistory).where(
                TrainingLoadHistory.athlete_id == workout.athlete_id
            )
        )
        row = result.scalar_one()
        assert float(row.daily_tss) > 0

    async def test_second_workout_updates_existing_row(self, db, workout_data):
        workout, _ = workout_data
        await calculate_load_indexes(workout.athlete_id, workout.id, db)
        # Вызов повторно — должен обновить существующую запись, не создать дубль
        await calculate_load_indexes(workout.athlete_id, workout.id, db)

        result = await db.execute(
            select(TrainingLoadHistory).where(
                TrainingLoadHistory.athlete_id == workout.athlete_id
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 1  # не два, а один ряд

    async def test_raises_for_unknown_workout(self, db, athlete_data):
        _, profile = athlete_data
        with pytest.raises(ValueError):
            await calculate_load_indexes(profile.id, uuid.uuid4(), db)


class TestGenerateAlerts:
    """Создание и дедупликация диагностических алертов."""

    async def _setup_p1_trigger(self, db, athlete_id: uuid.UUID) -> None:
        """Создаёт 3 строки TrainingLoadHistory с TSB < порога (П1)."""
        thresh = settings.ALERT_OVERLOAD_TSB_THRESHOLD  # -30
        for i in range(3):
            db.add(TrainingLoadHistory(
                id=uuid.uuid4(),
                athlete_id=athlete_id,
                date=date.today() - timedelta(days=i),
                daily_tss=Decimal("80.00"),
                atl_7d=Decimal("85.00"),
                ctl_42d=Decimal("50.00"),
                tsb=Decimal(str(thresh - 5)),  # -35, ниже порога
            ))
        await db.flush()

    async def test_p1_alert_created(self, db, athlete_data):
        _, profile = athlete_data
        await self._setup_p1_trigger(db, profile.id)

        alerts = await generate_alerts(profile.id, db)
        codes = [a.rule_code for a in alerts]
        assert "П1" in codes

    async def test_p1_severity_is_critical(self, db, athlete_data):
        _, profile = athlete_data
        await self._setup_p1_trigger(db, profile.id)

        alerts = await generate_alerts(profile.id, db)
        p1 = next(a for a in alerts if a.rule_code == "П1")
        assert p1.severity == "critical"

    async def test_no_duplicate_alert_on_second_call(self, db, athlete_data):
        _, profile = athlete_data
        await self._setup_p1_trigger(db, profile.id)

        first = await generate_alerts(profile.id, db)
        second = await generate_alerts(profile.id, db)

        assert any(a.rule_code == "П1" for a in first)
        # второй вызов не должен создавать дубль активного П1
        assert not any(a.rule_code == "П1" for a in second)

    async def test_returns_empty_when_no_conditions(self, db, athlete_data):
        _, profile = athlete_data
        # Нет истории нагрузки и телеметрии — ни одно правило не сработает
        alerts = await generate_alerts(profile.id, db)
        assert alerts == []

    async def test_alert_has_required_fields(self, db, athlete_data):
        _, profile = athlete_data
        await self._setup_p1_trigger(db, profile.id)

        alerts = await generate_alerts(profile.id, db)
        assert alerts
        a = alerts[0]
        assert a.id is not None
        assert a.athlete_id == profile.id
        assert a.rule_code
        assert a.message
        assert a.is_resolved is False
        assert a.created_at is not None
