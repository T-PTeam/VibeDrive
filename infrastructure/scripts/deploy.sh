#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$INFRA_DIR"

echo "==> Pulling latest images / rebuilding services..."
docker compose -f docker-compose.prod.yml --env-file .env pull --ignore-pull-failures
docker compose -f docker-compose.prod.yml --env-file .env build --pull

echo "==> Starting stack..."
docker compose -f docker-compose.prod.yml --env-file .env up -d

echo "==> Waiting for MySQL to become healthy..."
until docker inspect --format='{{.State.Health.Status}}' vibedrive-mysql-prod 2>/dev/null | grep -q "healthy"; do
    sleep 2
done

echo "==> Running Laravel migrations..."
docker exec vibedrive-backend-php-prod php artisan migrate --force

echo "==> Clearing Laravel config/route caches..."
docker exec vibedrive-backend-php-prod php artisan config:cache
docker exec vibedrive-backend-php-prod php artisan route:cache

echo "==> Deploy complete. Running health checks..."
bash "$SCRIPT_DIR/smoke-test.sh"
