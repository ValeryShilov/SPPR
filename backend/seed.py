#!/usr/bin/env python3
"""
Наполнение базы данных тестовыми данными для демонстрации СППР.

Запуск внутри контейнера:
    docker exec sppr-backend-1 python backend/seed.py

Создаёт:
  - 1 тренер  +  4 атлета
  - 1 тренировочная группа
  - 1 шаблон плана (12 недель)
  - ~600 тренировок (завершённые + запланированные)
  - Телеметрия для всех завершённых тренировок
  - История нагрузки ATL/CTL/TSB за 90 дней
  - Субъективные метрики (~5 дней из 7)
  - Диагностические алерты (2-3 на атлета)
"""

import asyncio
import os
import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, "/app")

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.models.alerts import DiagnosticAlert
from backend.models.athlete import (
    AthleteProfile,
    PhysiologicalMarker,
    SubjectiveMetric,
    TrainingLoadHistory,
)
from backend.models.group import GroupMembership, TrainingGroup
from backend.models.plan import IndividualWorkout, PlanTemplate
from backend.models.telemetry import ActualTelemetry
from backend.models.user import User

# ─── Конфигурация ─────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://sppr:sppr@postgres/sppr"
)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
random.seed(42)  # воспроизводимость

TODAY      = date.today()
SEED_START = TODAY - timedelta(days=90)  # 90 дней назад

# ─── Паттерн недельного цикла (0 = пн, 6 = вс) ───────────────────────────────
# (тип тренировки, зона, базовая длительность мин)
WEEK_PATTERN = [
    ("strength", "Z1",  45),   # Пн — силовая
    ("run",      "Z2",  75),   # Вт — базовая аэробика
    ("run",      "Z4",  50),   # Ср — интервалы
    ("run",      "Z2",  60),   # Чт — восстановительная
    ("rest",     "Z1",   0),   # Пт — отдых
    ("ski",      "Z2", 100),   # Сб — длинная
    ("run",      "Z1",  50),   # Вс — лёгкая
]

# Мультипликаторы нагрузки по неделям (0 = 13 недель назад, 12 = текущая)
# Структура: база → накопление → пик → восстановление → накопление → пик → конус
WEEK_LOAD = [
    0.80,  # нед 1  — вход в цикл
    0.90,  # нед 2
    1.00,  # нед 3
    0.55,  # нед 4  — разгрузка
    0.90,  # нед 5
    1.05,  # нед 6
    1.15,  # нед 7  — пиковая нагрузка
    0.50,  # нед 8  — разгрузка
    1.00,  # нед 9
    1.10,  # нед 10
    1.15,  # нед 11 — пик
    0.60,  # нед 12 — конус
    1.00,  # нед 13 — текущая / будущие
]

# TSS в минуту по зонам
TSS_RATE = {"Z1": 0.70, "Z2": 1.15, "Z3": 1.65, "Z4": 2.10, "Z5": 2.50}

# ─── Профили атлетов ──────────────────────────────────────────────────────────

ATHLETES_CFG = [
    dict(
        email="ivanov@sppr.dev",  password="athlete123",
        full_name="Алексей Иванов", first_name="Алексей", last_name="Иванов",
        birth_date=date(1999, 3, 15), gender="m", qualification="МС",
        max_hr=195, resting_hr=42, threshold_hr=177, hrv_baseline=68,
        ctl_start=58.0, atl_start=36.0, noise=1.00, k_qual=1.00,
    ),
    dict(
        email="petrova@sppr.dev", password="athlete123",
        full_name="Мария Петрова", first_name="Мария", last_name="Петрова",
        birth_date=date(2002, 7, 20), gender="f", qualification="КМС",
        max_hr=192, resting_hr=45, threshold_hr=172, hrv_baseline=62,
        ctl_start=50.0, atl_start=30.0, noise=0.95, k_qual=0.95,
    ),
    dict(
        email="sidorov@sppr.dev", password="athlete123",
        full_name="Дмитрий Сидоров", first_name="Дмитрий", last_name="Сидоров",
        birth_date=date(2004, 1, 10), gender="m", qualification="1 разряд",
        max_hr=198, resting_hr=48, threshold_hr=179, hrv_baseline=58,
        ctl_start=44.0, atl_start=28.0, noise=0.90, k_qual=0.90,
    ),
    dict(
        email="kozlova@sppr.dev", password="athlete123",
        full_name="Анна Козлова", first_name="Анна", last_name="Козлова",
        birth_date=date(1996, 11, 5), gender="f", qualification="МС",
        max_hr=188, resting_hr=40, threshold_hr=168, hrv_baseline=72,
        ctl_start=62.0, atl_start=38.0, noise=1.05, k_qual=1.00,
    ),
]

# ─── Вспомогательные функции ──────────────────────────────────────────────────

def calc_tss(wtype: str, zone: str, duration_min: float) -> float:
    if wtype == "rest" or duration_min == 0:
        return 0.0
    if wtype == "strength":
        return 45.0
    return duration_min * TSS_RATE.get(zone, 1.0)


def zone_hr_range(max_hr: int, zone: str) -> tuple[int, int]:
    bounds = {"Z1": (0.60, 0.72), "Z2": (0.72, 0.82),
              "Z3": (0.82, 0.87), "Z4": (0.87, 0.92), "Z5": (0.92, 1.00)}
    lo, hi = bounds.get(zone, (0.70, 0.80))
    return round(max_hr * lo), round(max_hr * hi)


def avg_hr_for(max_hr: int, zone: str, wtype: str) -> int | None:
    if wtype in ("rest", "strength") or zone == "Z1":
        return round(max_hr * 0.65) if wtype == "strength" else None
    lo, hi = zone_hr_range(max_hr, zone)
    return round((lo + hi) / 2) + random.randint(-5, 5)


def distance_km(wtype: str, zone: str, duration_min: float) -> float | None:
    if wtype in ("rest", "strength") or duration_min == 0:
        return None
    pace_per_km = {"Z1": 5.0, "Z2": 4.8, "Z3": 4.4, "Z4": 4.1, "Z5": 3.7}  # мин/км
    spd = 1.0 / pace_per_km.get(zone, 4.8)  # км/мин
    return round(duration_min * spd * (0.94 + random.random() * 0.12), 2)


def dec(v: float) -> Decimal:
    return Decimal(str(round(v, 2)))


# ─── Основная функция сидирования ─────────────────────────────────────────────

async def seed() -> None:
    engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

    async with AsyncSession(engine, expire_on_commit=False) as db:

        # Проверяем наличие данных
        existing = (await db.execute(
            select(User).where(User.email == "coach@sppr.dev")
        )).scalar_one_or_none()
        if existing:
            print("⚠  Данные уже существуют. Пропускаем.")
            return

        # ── Тренер ────────────────────────────────────────────────────────────
        print("→ Пользователи...")
        coach = User(
            email="coach@sppr.dev",
            password_hash=pwd_context.hash("coach123"),
            full_name="Виктор Смирнов",
            role="coach",
        )
        db.add(coach)
        await db.flush()

        # ── Атлеты: пользователи + профили + маркеры ──────────────────────────
        profiles: list[AthleteProfile] = []
        phys_markers: list[PhysiologicalMarker] = []

        for cfg in ATHLETES_CFG:
            u = User(
                email=cfg["email"],
                password_hash=pwd_context.hash(cfg["password"]),
                full_name=cfg["full_name"],
                role="athlete",
            )
            db.add(u)
            await db.flush()

            p = AthleteProfile(
                user_id=u.id,
                first_name=cfg["first_name"],
                last_name=cfg["last_name"],
                birth_date=cfg["birth_date"],
                gender=cfg["gender"],
                qualification=cfg["qualification"],
            )
            db.add(p)
            await db.flush()

            m = PhysiologicalMarker(
                athlete_id=p.id,
                date_recorded=SEED_START - timedelta(days=7),
                resting_hr=cfg["resting_hr"],
                max_hr=cfg["max_hr"],
                threshold_hr=cfg["threshold_hr"],
                hrv_baseline=cfg["hrv_baseline"],
                source="measured",
                notes="Углублённое медицинское обследование",
            )
            db.add(m)
            await db.flush()

            profiles.append(p)
            phys_markers.append(m)

        # ── Группа ────────────────────────────────────────────────────────────
        print("→ Группа и шаблон...")
        group = TrainingGroup(
            coach_user_id=coach.id,
            name="Лыжные гонки — основной состав",
            description="Группа подготовки к соревновательному сезону 2026",
            target_event="Чемпионат региона 2026",
        )
        db.add(group)
        await db.flush()

        for p in profiles:
            db.add(GroupMembership(
                group_id=group.id,
                athlete_id=p.id,
                joined_at=SEED_START - timedelta(days=7),
            ))

        # ── Шаблон плана ──────────────────────────────────────────────────────
        template = PlanTemplate(
            group_id=group.id,
            name="Подготовительный мезоцикл 12 недель",
            start_date=SEED_START,
            duration_days=104,
            description=(
                "Базово-развивающий цикл. "
                "Структура: 3 недели нагрузки / 1 неделя восстановления. "
                "Акцент — объёмная аэробная работа (Z2) + еженедельные интервалы (Z4)."
            ),
        )
        db.add(template)
        await db.flush()

        # ── Тренировки + телеметрия + нагрузка ────────────────────────────────
        print("→ Тренировки и нагрузка (это займёт несколько секунд)...")

        for ai, (profile, cfg) in enumerate(zip(profiles, ATHLETES_CFG)):
            atl: float = cfg["atl_start"]
            ctl: float = cfg["ctl_start"]
            max_hr: int = cfg["max_hr"]

            for day_off in range(105):  # 90 прошлых + 15 будущих
                cur = SEED_START + timedelta(days=day_off)
                weekday  = cur.weekday()
                week_num = min(day_off // 7, len(WEEK_LOAD) - 1)
                w_mult   = WEEK_LOAD[week_num]
                is_past  = cur < TODAY

                wtype, zone, base_dur = WEEK_PATTERN[weekday]
                is_rest = (wtype == "rest")

                # ── Плановые параметры ────────────────────────────────────────
                if is_rest:
                    planned_tss = 0.0
                    dur = 0
                else:
                    dur_raw = (
                        base_dur * w_mult * cfg["noise"]
                        * (0.92 + random.random() * 0.16)
                    )
                    dur = max(10, round(dur_raw / 5) * 5)
                    planned_tss = calc_tss(wtype, zone, dur) * cfg["k_qual"]

                # ── Создаём запись тренировки (кроме отдыха в прошлом) ────────
                workout_tss = 0.0  # фактический TSS для ATL/CTL
                if not (is_rest and is_past):
                    status_val = "completed" if is_past else "published"
                    k_form_val = round(max(0.70, min(1.30, 1.0 + (ctl - atl) / 100)), 3)

                    w = IndividualWorkout(
                        template_id=template.id,
                        athlete_id=profile.id,
                        marker_id_used=phys_markers[ai].id,
                        planned_date=cur,
                        planned_duration_min=dur if dur > 0 else None,
                        planned_tss=dec(planned_tss) if planned_tss > 0 else None,
                        k_qual=dec(cfg["k_qual"]),
                        k_form=dec(k_form_val),
                        target_zone=zone if wtype not in ("rest", "strength") else None,
                        workout_type=wtype,
                        status=status_val,
                    )
                    db.add(w)
                    await db.flush()

                    # ── Телеметрия для завершённых тренировок ─────────────────
                    if is_past and not is_rest and dur > 0:
                        fact_coef   = 0.88 + random.random() * 0.18
                        act_dur     = max(10, round(dur * fact_coef))
                        act_tss_val = planned_tss * fact_coef * (0.90 + random.random() * 0.15)
                        workout_tss = act_tss_val

                        dist = distance_km(wtype, zone, act_dur)
                        a_hr = avg_hr_for(max_hr, zone, wtype)

                        db.add(ActualTelemetry(
                            workout_id=w.id,
                            source="manual",
                            actual_duration_min=act_dur,
                            distance_km=dec(dist) if dist else None,
                            avg_hr=a_hr,
                            max_hr=round(max_hr * (0.92 + random.random() * 0.06)),
                            actual_tss=dec(act_tss_val),
                        ))

                # ── История нагрузки ──────────────────────────────────────────
                tss_for_ema = workout_tss if is_past else 0.0
                atl = atl + (tss_for_ema - atl) / 7
                ctl = ctl + (tss_for_ema - ctl) / 42
                tsb = ctl - atl

                if is_past:
                    db.add(TrainingLoadHistory(
                        athlete_id=profile.id,
                        date=cur,
                        daily_tss=dec(tss_for_ema),
                        atl_7d=dec(atl),
                        ctl_42d=dec(ctl),
                        tsb=dec(tsb),
                    ))

            print(
                f"   {cfg['last_name']:10s}  "
                f"CTL={ctl:5.1f}  ATL={atl:5.1f}  TSB={tsb:+5.1f}"
            )

        # ── Субъективные метрики ──────────────────────────────────────────────
        print("→ Субъективные метрики...")
        for ai, profile in enumerate(profiles):
            for day_off in range(88):
                if random.random() < 0.18:   # ~18% дней без записи
                    continue
                m_date   = SEED_START + timedelta(days=day_off)
                wn       = min(day_off // 7, len(WEEK_LOAD) - 1)
                intensity = WEEK_LOAD[wn]

                fatigue_raw = 3.0 + (intensity - 0.9) * 3.5 + random.gauss(0, 0.6)
                sleep_raw   = 4.2 - (intensity - 0.9) * 1.5 + random.gauss(0, 0.4)
                hrv_raw     = (
                    ATHLETES_CFG[ai]["hrv_baseline"]
                    * (1.0 - (intensity - 0.9) * 0.12)
                    + random.gauss(0, 2.5)
                )
                db.add(SubjectiveMetric(
                    athlete_id=profile.id,
                    date_recorded=m_date,
                    sleep_quality=min(5, max(1, round(sleep_raw))),
                    sleep_hours=dec(max(5.0, min(10.0, 7.5 + random.gauss(0, 0.5)))),
                    fatigue_level=min(5, max(1, round(fatigue_raw))),
                    hrv_value=round(max(30, hrv_raw)),
                ))

        # ── Диагностические алерты ────────────────────────────────────────────
        print("→ Диагностические алерты...")
        ALERTS = [
            ("critical", "П1", "TSB опустился ниже −30: высокий риск перетренированности. Рекомендуется снизить объём на 40%."),
            ("warning",  "П2", "Недельный объём превышает плановый на 22%. Контролируйте восстановление."),
            ("warning",  "П3", "HRV на 17% ниже базового уровня в течение 3 дней — признак накопленного утомления."),
            ("info",     "Н1", "CTL снизился на 4 у.е. за 7 дней. Возможен недогруз — проверьте посещаемость."),
            ("info",     "Н2", "TSB выше +15 в предсоревновательный период. Форма на пике — рекомендуется соревновательная нагрузка."),
            ("warning",  "П4", "Субъективная усталость 5/5 три дня подряд. Плановая тренировка отменена."),
        ]
        for profile in profiles:
            chosen = random.sample(ALERTS, k=random.randint(2, 4))
            for severity, code, msg in chosen:
                db.add(DiagnosticAlert(
                    athlete_id=profile.id,
                    severity=severity,
                    rule_code=code,
                    message=msg,
                    is_resolved=random.random() < 0.35,
                ))

        await db.commit()

    await engine.dispose()

    print("\n✅ Сид успешно завершён!\n")
    print("Учётные данные:")
    print("  Тренер:   coach@sppr.dev      / coach123")
    for cfg in ATHLETES_CFG:
        print(f"  Атлет:    {cfg['email']:<26s} / {cfg['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
