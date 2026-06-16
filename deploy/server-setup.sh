#!/bin/bash
# Full SPPR deployment on the server, one command:
#   curl -fsSL https://raw.githubusercontent.com/ValeryShilov/SPPR/main/deploy/server-setup.sh | bash
set -e
export DEBIAN_FRONTEND=noninteractive

# Locate project dir or download code from GitHub (when run via curl|bash)
if [ -f docker-compose.prod.yml ]; then
  :
elif [ -f /root/sppr/docker-compose.prod.yml ]; then
  cd /root/sppr
else
  cd /root
  rm -rf sppr SPPR-main
  echo ">>> Downloading code from GitHub..."
  curl -fsSL https://github.com/ValeryShilov/SPPR/archive/refs/heads/main.tar.gz | tar xz
  mv SPPR-main sppr
  cd sppr
fi

# Public IP -> <IP>.nip.io domain (free HTTPS via Caddy)
IP=$(curl -fsS https://api.ipify.org 2>/dev/null || curl -fsS https://ifconfig.me 2>/dev/null)
DOMAIN="${IP}.nip.io"
echo ">>> Server IP=${IP}  DOMAIN=${DOMAIN}"

# 1. Docker engine (from Ubuntu repos -- reachable; get.docker.com may be blocked)
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> Installing Docker engine via apt..."
  apt-get update -qq
  apt-get install -y docker.io
  systemctl enable --now docker
fi

# 2. Docker Compose v2 plugin (from GitHub releases -- reachable)
if ! docker compose version >/dev/null 2>&1; then
  echo ">>> Installing Docker Compose v2 plugin from GitHub..."
  mkdir -p /usr/lib/docker/cli-plugins
  curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/lib/docker/cli-plugins/docker-compose
fi

echo ">>> docker: $(docker --version)"
echo ">>> compose: $(docker compose version)"

# 3. .env with fresh secrets (created once)
if [ ! -f .env ]; then
  echo ">>> Creating .env..."
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

# 4. Build and start
echo ">>> Building and starting (a few minutes)..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "================================================"
echo "  DONE.  Open:  https://${DOMAIN}"
echo "  (Caddy will issue HTTPS cert in ~30 sec)"
echo "================================================"
