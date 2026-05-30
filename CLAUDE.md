# СППР для планирования подготовки в циклических видах спорта

## Архитектура
- Модульный монолит: FastAPI (Python 3.11) + React 18 (TypeScript)
- СУБД: PostgreSQL 16, ORM: SQLAlchemy 2.0 async + Alembic
- Фоновые задачи: Celery 5.3 + Redis 7
- Аутентификация: JWT (python-jose)
- UI: Mantine 7 + Recharts

## Структура проекта
- backend/ — FastAPI приложение
- frontend/ — React приложение (Vite)
- docker-compose.yml — все сервисы

## Роли пользователей
- coach (тренер) — планирование, просмотр аналитики, утверждение планов
- athlete (спортсмен) — просмотр плана, ввод метрик, загрузка телеметрии

## Ключевые сущности БД (12 таблиц)
users, athlete_profiles, training_groups, group_memberships,
physiological_markers, plan_templates, individual_workouts,
actual_telemetry, subjective_metrics, training_load_history,
diagnostic_alerts, alert_settings (singleton порогов алертов)

## Алгоритмы аналитического ядра
- Расчёт зон ЧСС по шкале Olympiatoppen (5 зон, % от ЧССmax)
- Адаптация шаблона: T_ind = T_template * k_qual * k_form
- Индексы нагрузки: TSS, ATL (7д), CTL (42д), TSB
- Алерты: 5 правил перегрузки (П1-П5) + 5 правил недогруза (Н1-Н5)

## Соглашения по коду
- Backend: async/await везде, pydantic v2 для схем
- Структура backend: routers/, services/, models/, schemas/
- Frontend: функциональные компоненты, React Query для запросов к API
- Названия таблиц: snake_case, все ID: UUID
- Язык комментариев: русский