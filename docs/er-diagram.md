# Модель данных

> Документ отражает фактически реализованную схему БД (PostgreSQL 16).
> Полей в коде больше, чем в первоначальном эскизе: добавлены поля привязки
> тренера, целей атлета, расписания шаблона, коэффициентов адаптации,
> данных по зонам ЧСС и 12-я таблица `alert_settings` (настраиваемые пороги).

## Сущности (12 таблиц)

### users
- id: UUID PK
- email: VARCHAR(255) UNIQUE
- password_hash: VARCHAR(255)
- full_name: VARCHAR(200) NULLABLE
- role: ENUM('athlete', 'coach', 'admin')
- is_active: BOOLEAN (default true)
- created_at: TIMESTAMP

### athlete_profiles
- id: UUID PK
- user_id: UUID FK → users (UNIQUE)
- first_name: VARCHAR(100)
- last_name: VARCHAR(100)
- birth_date: DATE
- gender: ENUM('m', 'f')
- qualification: VARCHAR(50) NULLABLE
- coach_user_id: UUID FK → users NULLABLE  -- прямая привязка тренера
- training_goal_type: VARCHAR(50) NULLABLE  -- цель подготовки (для кластеризации)
- target_event_name: VARCHAR(200) NULLABLE
- target_event_date: DATE NULLABLE
- created_at: TIMESTAMP

### training_groups
- id: UUID PK
- coach_user_id: UUID FK → users
- name: VARCHAR(200)
- description: TEXT
- min_age: INT
- max_age: INT
- target_event: VARCHAR(100)
- created_at: TIMESTAMP

### group_memberships
- id: UUID PK
- group_id: UUID FK → training_groups
- athlete_id: UUID FK → athlete_profiles
- joined_at: DATE
- is_active: BOOLEAN
- created_at: TIMESTAMP
- UNIQUE(group_id, athlete_id)

### physiological_markers
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date_recorded: DATE
- resting_hr: INT NULLABLE
- max_hr: INT NULLABLE
- threshold_hr: INT NULLABLE
- hrv_baseline: INT NULLABLE
- source: ENUM('measured', 'formula') (default 'measured')
- notes: TEXT NULLABLE
- created_at: TIMESTAMP

### plan_templates
- id: UUID PK
- group_id: UUID FK → training_groups NULLABLE  -- NULL после удаления группы
- name: VARCHAR(200)
- start_date: DATE
- duration_days: INT
- target_intensity_pct: DECIMAL(5,2) NULLABLE
- description: TEXT NULLABLE
- week_schedule: JSON NULLABLE  -- расписание микроцикла (список конфигов по дням)
- created_at: TIMESTAMP

### individual_workouts
- id: UUID PK
- template_id: UUID FK → plan_templates NULLABLE  -- NULL для самостоятельных тренировок
- athlete_id: UUID FK → athlete_profiles
- marker_id_used: UUID FK → physiological_markers NULLABLE
- planned_date: DATE
- planned_duration_min: INT NULLABLE
- planned_tss: DECIMAL(6,2) NULLABLE
- k_qual: DECIMAL(4,3) NULLABLE  -- коэффициент квалификации, применённый при адаптации
- k_form: DECIMAL(4,3) NULLABLE  -- коэффициент формы (по TSB), применённый при адаптации
- target_zone: VARCHAR(2) NULLABLE  -- Z1..Z5
- workout_type: VARCHAR(50) NULLABLE  -- ski/skiroll/run/bike/strength/recovery/rest/other
- workout_subtype: VARCHAR(50) NULLABLE  -- skate/classic/doublepoling (только лыжи/роллеры)
- description: TEXT NULLABLE
- interval_structure: JSONB NULLABLE  -- структура интервальной тренировки (сегменты)
- status: ENUM('draft', 'published', 'completed')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### actual_telemetry
- id: UUID PK
- workout_id: UUID FK → individual_workouts (UNIQUE)
- source: ENUM('imported', 'manual')
- actual_duration_min: INT NULLABLE
- distance_km: DECIMAL(7,3) NULLABLE
- avg_hr: INT NULLABLE
- max_hr: INT NULLABLE
- actual_tss: DECIMAL(6,2) NULLABLE
- hr_zone1_min: INT NULLABLE  -- время в зоне Z1, мин
- hr_zone2_min: INT NULLABLE  -- Z2
- hr_zone3_min: INT NULLABLE  -- Z3
- hr_zone4_min: INT NULLABLE  -- Z4
- hr_zone5_min: INT NULLABLE  -- Z5
- rpe: INT NULLABLE  -- субъективная оценка нагрузки (Borg)
- comment: TEXT NULLABLE
- timeseries: JSONB NULLABLE  -- downsampled ряд точек {s, hr, z, spd}
- raw_file_path: TEXT NULLABLE  -- путь к исходному файлу телеметрии
- recorded_at: TIMESTAMP

### subjective_metrics
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date_recorded: DATE
- sleep_quality: INT NULLABLE
- sleep_hours: DECIMAL(3,1) NULLABLE
- fatigue_level: INT NULLABLE
- hrv_value: INT NULLABLE
- created_at: TIMESTAMP
- UNIQUE(athlete_id, date_recorded)

### training_load_history
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date: DATE
- daily_tss: DECIMAL(6,2) (default 0)
- atl_7d: DECIMAL(6,2) (default 0)
- ctl_42d: DECIMAL(6,2) (default 0)
- tsb: DECIMAL(6,2) (default 0)
- created_at: TIMESTAMP
- UNIQUE(athlete_id, date)

### diagnostic_alerts
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- triggered_by_workout_id: UUID FK → individual_workouts (NULLABLE)
- triggered_by_subjective_id: UUID FK → subjective_metrics (NULLABLE)
- severity: ENUM('info', 'warning', 'critical')
- rule_code: VARCHAR(10)  -- П1..П5, Н1..Н5
- message: TEXT
- is_resolved: BOOLEAN
- created_at: TIMESTAMP

### alert_settings
Singleton-таблица настраиваемых порогов диагностики (ровно одна строка, id = 1).
При отсутствии строки применяются умолчания из `backend/core/config.py`.
- id: INT PK (singleton, = 1)
- p1_tsb_threshold: FLOAT (default -30.0)   -- П1: порог TSB
- p2_resting_hr_pct: FLOAT (default 7.0)    -- П2: % роста ЧСС покоя
- p3_hrv_pct: FLOAT (default 85.0)          -- П3: % HRV от базового
- p5_z45_pct: FLOAT (default 20.0)          -- П5: доля Z4+Z5
- h1_ctl_delta: FLOAT (default 2.0)         -- Н1: изменение CTL
- h2_tsb_high: FLOAT (default 15.0)         -- Н2: высокий TSB
- h3_tss_pct: FLOAT (default 50.0)          -- Н3: % недельного TSS
- h5_z12_pct: FLOAT (default 75.0)          -- Н5: доля Z1+Z2
- updated_at: TIMESTAMP
- updated_by_id: UUID FK → users NULLABLE

## Связи

| От | К | Тип |
|---|---|---|
| users → training_groups | coach_user_id | 1:N |
| users → athlete_profiles | user_id | 1:0..1 |
| users → athlete_profiles | coach_user_id (прямая привязка) | 1:N |
| users → alert_settings | updated_by_id | 1:0..1 |
| training_groups ↔ athlete_profiles | через group_memberships | N:M |
| athlete_profiles → physiological_markers | athlete_id | 1:N |
| training_groups → plan_templates | group_id (NULLABLE) | 1:N |
| plan_templates → individual_workouts | template_id (NULLABLE) | 1:N |
| athlete_profiles → individual_workouts | athlete_id | 1:N |
| physiological_markers → individual_workouts | marker_id_used | 1:N |
| individual_workouts → actual_telemetry | workout_id | 1:0..1 |
| athlete_profiles → subjective_metrics | athlete_id | 1:N |
| athlete_profiles → training_load_history | athlete_id | 1:N |
| athlete_profiles → diagnostic_alerts | athlete_id | 1:N |
| individual_workouts → diagnostic_alerts | triggered_by_workout_id | 1:0..1 |
| subjective_metrics → diagnostic_alerts | triggered_by_subjective_id | 1:0..1 |

## Примечания по поведению

- При удалении группы `plan_templates.group_id` обнуляется (шаблоны сохраняются).
- При смене группы шаблона незавершённые `individual_workouts` удаляются и
  пересоздаются при повторной адаптации.
- `actual_telemetry` и `diagnostic_alerts` каскадно удаляются вместе с
  `individual_workouts` (cascade="all, delete-orphan").
