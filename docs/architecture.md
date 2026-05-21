# Архитектура программного комплекса

## Паттерн
Модульный монолит (Modular Monolith) с асинхронной обработкой задач.
Единый физический узел развёртывания, модули изолированы на уровне
пространств имён и общаются через чётко определённые интерфейсы.

## Уровни системы

### 1. Модуль представления (UI)
- React 18 + TypeScript + Mantine 7
- Взаимодействие с backend через REST API (Axios)
- Графики: Recharts
- Сборка: Vite 5

### 2. Базовое ядро (Core Domain) — backend/
Четыре подсистемы:

**Подсистема аутентификации** (backend/core/auth.py)
- JWT-токены (python-jose)
- Хэширование паролей (passlib + bcrypt)
- Dependency get_current_user для защищённых роутеров
- Разграничение прав по ролям: coach / athlete

**Подсистема управления пользователями и группами**
(backend/routers/users.py, backend/routers/groups.py)
- CRUD профилей атлетов
- Управление составом групп через group_memberships
- Членство атлета в нескольких группах одновременно
- При добавлении атлета → триггер автоматической кластеризации

**Подсистема управления тренировочными планами**
(backend/routers/templates.py, backend/routers/workouts.py)
- CRUD шаблонов микроциклов
- Управление статусами individual_workouts: draft → published → completed
- Запуск адаптации шаблона через Celery-задачу
- Направление файлов телеметрии в брокер задач

**Сервис аналитической отчётности**
(backend/routers/analytics.py)
- Агрегация ATL/CTL/TSB из training_load_history
- План-факт анализ из individual_workouts + actual_telemetry
- Сводка по группе: алерты, статусы планов
- Данные отдаются как JSON для Recharts на фронтенде

### 3. Аналитическое ядро (СППР) — backend/services/analytics.py
Изолированный модуль, не принимает HTTP-запросы напрямую.
Вызывается из роутеров и Celery-задач.

Четыре компонента:
- calculate_hr_zones(athlete_id) → зоны Z1-Z5
- adapt_template(template_id) → расчётная матрица черновиков
- calculate_load_indexes(athlete_id, workout_id) → TSS/ATL/CTL/TSB
- generate_alerts(athlete_id) → диагностические алерты

Подробнее — см. docs/algorithms.md

### 4. Фоновые задачи (Background Workers) — backend/tasks/
Celery 5.3 + Redis 7 как брокер.

**Очередь задач (Task Broker)**
- Redis хранит очередь в оперативной памяти
- Celery-воркер запускается отдельным процессом/контейнером
- Конфигурация: backend/core/celery_app.py

**Адаптер парсинга телеметрии**
- backend/tasks/telemetry.py → parse_telemetry_file()
- Поддерживаемые форматы: FIT, GPX, TCX, CSV
- После парсинга → вызов calculate_load_indexes → вызов generate_alerts
- Подробнее — см. docs/telemetry-parsing.md

**Служба агрегации выполненных объёмов**
- Вычисляет итоговые метрики сессии: дистанция, время в зонах,
  средний темп, фактический TSS
- Сохраняет в actual_telemetry
- Инициирует обновление training_load_history

### 5. Уровень хранения данных (Data Layer)
- PostgreSQL 16 — единственный источник истины
- SQLAlchemy 2.0 async — ORM
- Alembic — миграции схемы
- 11 сущностей — см. docs/er-diagram.md

## Структура папок backend/
    backend/
    ├── main.py                  -- точка входа FastAPI
    ├── core/
    │   ├── auth.py              -- JWT, get_current_user
    │   ├── celery_app.py        -- инициализация Celery
    │   ├── config.py            -- настройки (env-переменные)
    │   └── database.py          -- async engine, session
    ├── models/                  -- SQLAlchemy модели (по файлу на сущность)
    │   ├── user.py
    │   ├── athlete.py
    │   ├── group.py
    │   ├── plan.py
    │   ├── telemetry.py
    │   └── alerts.py
    ├── schemas/                 -- Pydantic v2 схемы
    │   ├── auth.py
    │   ├── athlete.py
    │   ├── group.py
    │   ├── plan.py
    │   ├── telemetry.py
    │   └── analytics.py
    ├── routers/                 -- FastAPI роутеры
    │   ├── auth.py
    │   ├── users.py
    │   ├── groups.py
    │   ├── templates.py
    │   ├── workouts.py
    │   ├── telemetry.py
    │   ├── metrics.py
    │   └── analytics.py
    ├── services/
    │   └── analytics.py         -- аналитическое ядро СППР
    └── tasks/
    └── telemetry.py         -- Celery-задачи парсинга

## Структура папок frontend/
    frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx              -- роутинг, PrivateRoute
│   ├── api/
│   │   ├── client.ts        -- axios instance с interceptors
│   │   ├── auth.ts
│   │   ├── athletes.ts
│   │   ├── groups.ts
│   │   ├── plans.ts
│   │   ├── telemetry.ts
│   │   └── analytics.ts
│   ├── components/
│   │   ├── AlertsPanel.tsx
│   │   ├── ZonesTable.tsx
│   │   ├── TelemetryUpload.tsx
│   │   └── LoadChart.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── CoachDashboard.tsx
│   │   ├── AthleteProfile.tsx
│   │   ├── TemplateEditor.tsx
│   │   ├── Matrix.tsx
│   │   ├── LoadAnalytics.tsx
│   │   └── AthleteCabinet.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useAlerts.ts
│   └── store/
│       └── AuthContext.tsx

## docker-compose.yml сервисы

| Сервис | Образ | Порт |
|---|---|---|
| postgres | postgres:16 | 5432 |
| redis | redis:7 | 6379 |
| backend | ./backend | 8000 |
| celery_worker | ./backend | — |
| frontend | ./frontend | 3000 |

## Маршруты frontend (React Router)

| Маршрут | Компонент | Роль | Прецедент |
|---|---|---|---|
| /login | Login.tsx | Обе | Аутентификация |
| /dashboard | CoachDashboard.tsx | coach | Дашборд — алерты, состояние групп |
| /groups | GroupList.tsx | coach | Управление группами |
| /groups/:id | GroupDetail.tsx | coach | Состав группы |
| /athletes/:id | AthleteProfile.tsx | coach | Профиль атлета, зоны, маркеры |
| /planning | TemplateList.tsx | coach | Список шаблонов |
| /planning/:id/edit | TemplateEditor.tsx | coach | Редактор шаблона (зоны Z1–Z5) |
| /planning/:id/matrix | Matrix.tsx | coach | Расчётная матрица, утверждение |
| /analytics/:athleteId | LoadAnalytics.tsx | coach | Графики ATL/CTL/TSB, план-факт |
| /my-plan | AthleteCabinet.tsx | athlete | Задание на сегодня |
| /metrics | MetricsInput.tsx | athlete | Ежедневный опросник |
| /training-log | TrainingLog.tsx | athlete | История + загрузка телеметрии |

## Ключевые UI-принципы (из раздела 2.5.4)
- Расчётные значения (source=formula) — серый бейдж, измеренные (source=measured) — зелёный
- Алерты на дашборде разделены по severity: critical (красный), warning (жёлтый), info (синий)
- Основной маршрут тренера линейный: TemplateEditor → Matrix → утверждение
- Интерфейс спортсмена — максимум 1 уровень вложенности от главного экрана
- Агрегированные показатели шаблона (доля Z4+Z5, доля Z1+Z2) с цветовой индикацией нормы