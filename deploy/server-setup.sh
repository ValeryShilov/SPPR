#!/bin/bash
# Полное развёртывание СППР на сервере.
# Запуск (после распаковки архива в /root/sppr):
#   bash /root/sppr/deploy/server-setup.sh
set -e
cd "$(dirname "$0")/.."   # → корень проекта (/root/sppr)

# Публичный IP сервера → домен <IP>.nip.io (бесплатный HTTPS через Caddy)
IP=$(curl -fsS https://api.ipify.org 2>/dev/null || curl -fsS https://ifconfig.me 2>/dev/null)
DOMAIN="${IP}.nip.io"
echo ">>> Сервер IP=${IP}  DOMAIN=${DOMAIN}"

# 1. Docker (если ещё не установлен)
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> Установка Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. .env с новыми секретами (создаётся один раз)
if [ ! -f .env ]; then
  echo ">>> Создаю .env..."
  SECRET=$(openssl rand -base64 48 | tr -d '\n=/+' | cut -c1-64)
  DBPASS=$(openssl rand -hex 16)
  cat > .env <<EOF
DATABASE_URL=postgresql+asyncpg://sppr:${DBPASS}@postgres:5432/sppr
REDIS_URL=redis://redis:6379/0
SECRET_KEY=${SECRET}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
POSTGRES_PASSWORD=${DBPASS}
CORS_ORIGINS=https://${DOMAIN}
SITE_ADDRESS=${DOMAIN}
WEB_CONCURRENCY=2
EOF
fi

# 3. Сборка и запуск
echo ">>> Сборка и запуск (несколько минут)..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "================================================"
echo "  Готово!  Открой:  https://${DOMAIN}"
echo "  (HTTPS-сертификат Caddy выпустит за ~30 сек)"
echo "================================================"
