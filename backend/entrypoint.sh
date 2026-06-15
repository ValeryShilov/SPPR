#!/bin/sh
set -e

cd /app

echo "-> Применение миграций БД (alembic upgrade head)..."
alembic -c backend/alembic.ini upgrade head

echo "-> Запуск gunicorn (uvicorn workers)..."
exec gunicorn backend.main:app \
    -k uvicorn.workers.UvicornWorker \
    -w "${WEB_CONCURRENCY:-2}" \
    -b 0.0.0.0:8000 \
    --access-logfile - \
    --error-logfile -
