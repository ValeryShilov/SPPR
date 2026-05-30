# Спецификация API

Базовый URL: /api/v1

> Документ отражает фактически реализованные роутеры
> (`backend/routers/`). Маршруты сгруппированы по префиксам, указанным
> в `backend/main.py`.

## Аутентификация — /auth
POST   /auth/register         -- регистрация {email, password, full_name?} → {access_token, role}
POST   /auth/login            -- {email, password} → {access_token, role}
GET    /auth/me               -- текущий пользователь
PATCH  /auth/me               -- обновить свой аккаунт (email, full_name)
POST   /auth/change-password  -- сменить пароль
GET    /auth/coaches          -- список тренеров (для привязки/выбора)
POST   /auth/create-athlete   -- тренер создаёт аккаунт+профиль атлета (coach/admin)

## Пользователи — /users
GET    /users                      -- список пользователей (admin)
GET    /users/me                   -- свой пользователь
PATCH  /users/me                   -- обновить себя
POST   /users/me/change-password   -- сменить пароль
GET    /users/{user_id}            -- пользователь по id (admin)
PATCH  /users/{user_id}/deactivate -- деактивировать аккаунт (admin)

## Профили атлетов — /athletes
GET    /athletes                    -- список профилей
POST   /athletes                    -- создать профиль для текущего пользователя
GET    /athletes/me                 -- свой профиль (роль athlete)
GET    /athletes/{id}               -- профиль атлета
PUT    /athletes/{id}               -- обновление профиля
POST   /athletes/{id}/bind-coach    -- привязать атлета к текущему тренеру
DELETE /athletes/{id}/bind-coach    -- отвязать атлета от тренера
DELETE /athletes/{id}?action=remove|deactivate
                                    -- удалить: remove (убрать из групп + отвязать) |
                                       deactivate (то же + блокировка аккаунта)
GET    /athletes/{id}/markers       -- история физиологических маркеров
POST   /athletes/{id}/markers       -- добавить маркер
GET    /athletes/{id}/zones         -- пульсовые зоны атлета (Olympiatoppen)
GET    /athletes/{id}/history       -- история тренировок (план-факт)
GET    /athletes/{id}/upcoming      -- предстоящие тренировки

## Маркеры — /markers
GET    /markers/{id}                -- маркер по id
PUT    /markers/{id}                -- обновить маркер
DELETE /markers/{id}                -- удалить маркер

## Группы — /groups
GET    /groups                      -- список групп тренера
POST   /groups                      -- создать группу
GET    /groups/{id}                 -- группа по id
PUT    /groups/{id}                 -- обновить группу
DELETE /groups/{id}                 -- удалить группу (шаблоны → group_id = NULL)
GET    /groups/{id}/members         -- состав группы
POST   /groups/{id}/members         -- добавить атлета в группу
DELETE /groups/{id}/members/{aid}   -- убрать атлета из группы

## Шаблоны и планирование — /templates
GET    /templates                       -- список шаблонов (со сводкой)
POST   /templates                       -- создать шаблон
GET    /templates/{id}                  -- получить шаблон
PUT    /templates/{id}                  -- обновить шаблон (при смене группы чистит черновики)
DELETE /templates/{id}                  -- удалить шаблон (+ тренировки и алерты)
POST   /templates/{id}/adapt            -- запустить адаптацию через Celery → task_id
POST   /templates/{id}/adapt-sync       -- синхронная адаптация (ответ по завершении)
GET    /templates/{id}/matrix           -- расчётная матрица (черновики)
GET    /templates/{id}/group-members    -- активные атлеты группы шаблона
GET    /templates/{id}/athlete-zones    -- зоны ЧСС атлетов (для матрицы)
GET    /templates/{id}/alerts           -- активные алерты атлетов группы
GET    /templates/{id}/week-conflicts?week_start=DATE
                                        -- конфликты расписания при утверждении недели
POST   /templates/{id}/approve-all?week_start=DATE
                                        -- утвердить черновики (всей недели или шаблона)

## Тренировки — /workouts
GET    /workouts/{id}               -- индивидуальная тренировка
PUT    /workouts/{id}               -- ручное редактирование тренером
POST   /workouts/{id}/approve       -- утвердить (draft → published)
POST   /workouts                    -- создать тренировку (тренер)
DELETE /workouts/{id}               -- удалить тренировку
POST   /workouts/self               -- атлет создаёт самостоятельную тренировку
DELETE /workouts/self/{id}          -- атлет удаляет свою самостоятельную тренировку

## Телеметрия и план атлета — /api/v1
GET    /my-plan                          -- предстоящий план атлета (published/completed)
POST   /telemetry/upload                 -- загрузка файла FIT/GPX/TCX/CSV (multipart) → task_id
GET    /telemetry/status/{task_id}       -- статус Celery-обработки файла
GET    /telemetry/workout/{workout_id}   -- телеметрия тренировки
POST   /telemetry/manual                 -- ручной ввод фактических данных
PATCH  /telemetry/workout/{workout_id}/notes
                                         -- RPE и комментарий (→ status=completed)

## Метрики (спортсмен) — /metrics
POST   /metrics                     -- субъективные метрики (сон, усталость, HRV)
GET    /metrics/today               -- метрики за сегодня

## Аналитика — /analytics
GET    /analytics/load/{athlete_id}        -- ATL/CTL/TSB за период
GET    /analytics/plan-fact/{athlete_id}   -- план-факт по неделям
GET    /analytics/volume/{athlete_id}      -- объёмы и время в зонах
GET    /analytics/alerts/{athlete_id}      -- активные алерты
PUT    /analytics/alerts/{id}/resolve      -- отметить алерт решённым
GET    /analytics/group-summary/{gid}      -- сводка по группе
GET    /analytics/group-week/{gid}         -- недельный срез группы
GET    /analytics/coach-athletes           -- сводная таблица атлетов тренера

## Настройки порогов алертов — /settings
GET    /settings/alerts             -- текущие пороги (П1–П5, Н1–Н5)
PUT    /settings/alerts             -- обновить пороги (coach/admin)

## Служебное
GET    /health                      -- проверка живости сервиса
