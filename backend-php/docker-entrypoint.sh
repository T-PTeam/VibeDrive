#!/bin/sh
set -e
cd /var/www/html
if [ -f artisan ]; then
  php artisan migrate --force
  php artisan db:seed --class=TestUserSeeder --force
fi
exec "$@"
