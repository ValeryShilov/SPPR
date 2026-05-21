# Спецификация API

Базовый URL: /api/v1

## Аутентификация
POST   /auth/login          -- {email, password} → {access_token, role}
GET    /auth/me             -- → текущий пользователь

## Пользователи и профили
POST   /users/register      -- регистрация
GET    /athletes/{id}       -- профиль атлета
PUT    /athletes/{id}       -- обновление профиля
GET    /athletes/{id}/zones -- пульсовые зоны атлета

## Маркеры
GET    /athletes/{id}/markers       -- история маркеров
POST   /athletes/{id}/markers       -- добавить маркер
PUT    /markers/{id}                -- обновить маркер

## Группы
GET    /groups                      -- список групп тренера
POST   /groups                      -- создать группу
GET    /groups/{id}                 -- состав группы
POST   /groups/{id}/members         -- добавить атлета в группу
DELETE /groups/{id}/members/{aid}   -- удалить атлета из группы

## Шаблоны и планирование
GET    /templates                   -- список шаблонов
POST   /templates                   -- создать шаблон
GET    /templates/{id}              -- получить шаблон
PUT    /templates/{id}              -- обновить шаблон
POST   /templates/{id}/adapt        -- запустить адаптацию → task_id
GET    /templates/{id}/matrix       -- расчётная матрица (черновики)

## Тренировки
GET    /workouts/{id}               -- индивидуальная тренировка
PUT    /workouts/{id}               -- ручное редактирование тренером
POST   /workouts/{id}/approve       -- утвердить (draft → published)
POST   /templates/{id}/approve-all  -- утвердить все черновики

## Телеметрия и метрики (спортсмен)
GET    /my-plan                     -- план на текущую неделю
POST   /telemetry/upload            -- загрузка файла (multipart)
GET    /telemetry/status/{task_id}  -- статус обработки файла
POST   /metrics                     -- субъективные метрики
GET    /metrics/today               -- метрики за сегодня

## Аналитика
GET    /analytics/load/{athlete_id}       -- ATL/CTL/TSB за период
GET    /analytics/plan-fact/{athlete_id}  -- план-факт по неделям
GET    /analytics/alerts/{athlete_id}     -- активные алерты
PUT    /analytics/alerts/{id}/resolve     -- отметить алерт решённым
GET    /analytics/group-summary/{gid}     -- сводка по группе