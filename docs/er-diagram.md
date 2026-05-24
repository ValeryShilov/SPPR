# Модель данных

## Сущности

### users
- id: UUID PK
- email: VARCHAR(255) UNIQUE
- password_hash: VARCHAR(255)
- role: ENUM('athlete', 'coach', 'admin')
- created_at: TIMESTAMP

### athlete_profiles
- id: UUID PK
- user_id: UUID FK → users (UNIQUE)
- first_name: VARCHAR(100)
- last_name: VARCHAR(100)
- birth_date: DATE
- gender: ENUM('m', 'f')
- qualification: VARCHAR(50)

### training_groups
- id: UUID PK
- coach_user_id: UUID FK → users
- name: VARCHAR(200)
- description: TEXT
- min_age: INT
- max_age: INT
- target_event: VARCHAR(100)

### group_memberships
- id: UUID PK
- group_id: UUID FK → training_groups
- athlete_id: UUID FK → athlete_profiles
- joined_at: DATE
- is_active: BOOLEAN
- UNIQUE(group_id, athlete_id)

### physiological_markers
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date_recorded: DATE
- resting_hr: INT
- max_hr: INT
- threshold_hr: INT
- hrv_baseline: INT
- source: ENUM('measured', 'formula')
- notes: TEXT

### plan_templates
- id: UUID PK
- group_id: UUID FK → training_groups
- name: VARCHAR(200)
- start_date: DATE
- duration_days: INT
- target_intensity_pct: DECIMAL(5,2)
- description: TEXT

### individual_workouts
- id: UUID PK
- template_id: UUID FK → plan_templates
- athlete_id: UUID FK → athlete_profiles
- marker_id_used: UUID FK → physiological_markers
- planned_date: DATE
- planned_duration_min: INT
- planned_tss: DECIMAL(6,2)
- target_zone: VARCHAR(2)  -- Z1..Z5
- status: ENUM('draft', 'published', 'completed')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### actual_telemetry
- id: UUID PK
- workout_id: UUID FK → individual_workouts (UNIQUE)
- source: ENUM('imported', 'manual')
- actual_duration_min: INT
- distance_km: DECIMAL(7,3)
- avg_hr: INT
- max_hr: INT
- actual_tss: DECIMAL(6,2)
- recorded_at: TIMESTAMP

### subjective_metrics
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date_recorded: DATE
- sleep_quality: INT
- sleep_hours: DECIMAL(3,1)
- fatigue_level: INT
- hrv_value: INT
- UNIQUE(athlete_id, date_recorded)

### training_load_history
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- date: DATE
- daily_tss: DECIMAL(6,2)
- atl_7d: DECIMAL(6,2)
- ctl_42d: DECIMAL(6,2)
- tsb: DECIMAL(6,2)
- UNIQUE(athlete_id, date)

### diagnostic_alerts
- id: UUID PK
- athlete_id: UUID FK → athlete_profiles
- triggered_by_workout_id: UUID FK → individual_workouts (NULLABLE)
- triggered_by_subjective_id: UUID FK → subjective_metrics (NULLABLE)
- created_at: TIMESTAMP
- severity: ENUM('info', 'warning', 'critical')
- rule_code: VARCHAR(10)  -- П1..П5, Н1..Н5
- message: TEXT
- is_resolved: BOOLEAN

## Связи

| От | К | Тип |
|---|---|---|
| users → training_groups | coach_user_id | 1:N |
| users → athlete_profiles | user_id | 1:0..1 |
| training_groups ↔ athlete_profiles | через group_memberships | N:M |
| athlete_profiles → physiological_markers | athlete_id | 1:N |
| training_groups → plan_templates | group_id | 1:N |
| plan_templates → individual_workouts | template_id | 1:N |
| athlete_profiles → individual_workouts | athlete_id | 1:N |
| physiological_markers → individual_workouts | marker_id_used | 1:N |
| individual_workouts → actual_telemetry | workout_id | 1:0..1 |
| athlete_profiles → subjective_metrics | athlete_id | 1:N |
| athlete_profiles → training_load_history | athlete_id | 1:N |
| athlete_profiles → diagnostic_alerts | athlete_id | 1:N |
| individual_workouts → diagnostic_alerts | triggered_by_workout_id | 1:0..1 |
| subjective_metrics → diagnostic_alerts | triggered_by_subjective_id | 1:01 |
