# Развёртывание (production)

Боевой запуск отличается от dev: фронт собирается в статику, backend работает
под gunicorn без авто-перезагрузки, всё проходит через реверс-прокси **Caddy**
(TLS + маршрутизация). Dev-окружение (`docker-compose.yml`) при этом остаётся
рабочим — прод это отдельные файлы.

## Файлы прода

| Файл | Назначение |
|---|---|
| `docker-compose.prod.yml` | боевые сервисы (проект `sppr-prod`, изолирован от dev) |
| `backend/Dockerfile.prod` + `entrypoint.sh` | gunicorn + авто-миграции при старте |
| `frontend/Dockerfile.prod` + `nginx.conf` | сборка статики (`vite build`) → nginx |
| `Caddyfile` | реверс-прокси: `/api/*` → backend, остальное → фронт; TLS |
| `.env` | секреты (на сервере свои, не из git) |

Архитектура: наружу торчит только Caddy; фронт и `/api` — на одном адресе
(поэтому CORS в проде не нужен). Postgres/Redis — без публичных портов.

---

## A. Локальная репетиция (на своём компьютере)

Цель — увидеть, как устроен прод, не арендуя сервер.

1. Подготовьте `.env` (можно тот же, что для dev). Для локального прода:
   ```
   SITE_ADDRESS=:80
   ```
   (Caddy отдаёт HTTP на `http://localhost`, без сертификата.)

2. Соберите и запустите прод:
   ```
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   При старте backend сам накатит миграции (`alembic upgrade head`).

   Прод изолирован от dev (проект `sppr-prod`, своя БД), и порты не пересекаются:
   dev на `:3000`/`:8000`, прод на `:80`. Можно держать оба одновременно.

3. Откройте **http://localhost** — приложение работает в боевом режиме.

5. База у прод-проекта **своя и пустая**. Создайте тренера через регистрацию,
   либо (только для локальной демонстрации) наполните демо-данными:
   ```
   docker compose -f docker-compose.prod.yml exec backend python backend/seed.py
   ```
   ⚠️ На реальном сервере `seed.py` НЕ запускать (демо-пароли).

Вернуться в dev:
```
docker compose -f docker-compose.prod.yml down
docker compose up -d
```

---

## B. Показать другу (туннель)

`localhost` виден только на вашем ПК. Чтобы дать другу публичную ссылку, пока
ноут включён, поднимите туннель к порту 80 (Caddy):

**Cloudflare Tunnel (быстрая ссылка, без регистрации):**
```
cloudflared tunnel --url http://localhost:80
```
Команда выведет ссылку вида `https://<случайное>.trycloudflare.com` — её и
отправьте. Работает, пока запущены прод-контейнеры и туннель.

(Аналогично работает `ngrok http 80`.)

⚠️ Ноут не должен уснуть; у бесплатных туннелей ссылка меняется при перезапуске.

---

## C. Боевой сервер (VPS)

1. Арендуйте VPS (Ubuntu 22.04, 2 vCPU / 4 ГБ). Откройте порты 22, 80, 443.
2. Привяжите домен (A-запись на IP сервера).
3. Установите Docker и Compose-плагин.
4. Склонируйте репозиторий, создайте `.env` **на сервере** (не из git):
   ```
   SECRET_KEY=<python -c "import secrets; print(secrets.token_urlsafe(48))">
   POSTGRES_PASSWORD=<надёжный пароль>
   DATABASE_URL=postgresql+asyncpg://sppr:<тот же пароль>@postgres:5432/sppr
   REDIS_URL=redis://redis:6379/0
   SITE_ADDRESS=sppr.example.com
   CORS_ORIGINS=https://sppr.example.com
   ```
5. Запустите:
   ```
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   Caddy автоматически выпустит HTTPS-сертификат для домена.
6. Создайте реальные учётные записи (регистрация / «+ Новый атлет»).
   `seed.py` на проде не запускать.

Обновление после изменений: `git pull && docker compose -f docker-compose.prod.yml up -d --build`
(миграции применятся автоматически).

---

## Эксплуатация

- **Логи:** `docker compose -f docker-compose.prod.yml logs -f`
- **Бэкап БД:** `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U sppr sppr > backup.sql`
- **Тома в бэкап:** `postgres_data` (БД), `uploads_data` (файлы телеметрии)
- Контейнеры перезапускаются сами (`restart: unless-stopped`).
