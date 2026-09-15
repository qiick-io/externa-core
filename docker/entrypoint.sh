#!/usr/bin/env bash
set -euo pipefail

role="${1:-app}"

cd /var/www/html

mkdir -p storage/framework/{cache,sessions,views} storage/logs storage/app/{public,private,zips,tmp} bootstrap/cache
chmod -R ug+rwx storage bootstrap/cache 2>/dev/null || true

if [[ -f artisan ]]; then
  # Dev bind-mount: install PHP deps into the named vendor volume when empty
  if [[ "${APP_ENV:-local}" != "production" && ! -f vendor/autoload.php && -f composer.json ]]; then
    echo "Installing Composer dependencies..."
    composer install --no-interaction --prefer-dist --optimize-autoloader
  fi

  if [[ -f artisan && -z "${APP_KEY:-}" ]]; then
    echo "Generating APP_KEY..."
    php artisan key:generate --force || true
  fi

  if [[ -n "${DB_HOST:-}" && "${DB_CONNECTION:-}" != "sqlite" ]]; then
    echo "Waiting for database ${DB_HOST}:${DB_PORT:-5432}..."
    for i in $(seq 1 60); do
      if php -r "
        try {
          new PDO(
            sprintf('%s:host=%s;port=%s;dbname=%s',
              getenv('DB_CONNECTION') === 'pgsql' ? 'pgsql' : 'mysql',
              getenv('DB_HOST'),
              getenv('DB_PORT') ?: (getenv('DB_CONNECTION') === 'pgsql' ? '5432' : '3306'),
              getenv('DB_DATABASE')
            ),
            getenv('DB_USERNAME'),
            getenv('DB_PASSWORD') ?: ''
          );
          exit(0);
        } catch (Throwable \$e) { exit(1); }
      "; then
        break
      fi
      sleep 1
    done
  fi

  if [[ "${APP_ENV:-local}" == "production" || "${CACHE_CONFIG:-false}" == "true" ]]; then
    php artisan config:cache || true
    php artisan route:cache || true
    php artisan view:cache || true
    php artisan event:cache || true
  fi

  if [[ "${RUN_MIGRATIONS:-false}" == "true" ]]; then
    php artisan migrate --force
  fi

  if [[ "${STORAGE_LINK:-true}" == "true" ]]; then
    php artisan storage:link --force 2>/dev/null || true
  fi
fi

case "$role" in
  app)
    php-fpm -D
    exec nginx -g 'daemon off;'
    ;;
  horizon)
    exec php artisan horizon
    ;;
  reverb)
    exec php artisan reverb:start --host=0.0.0.0 --port="${REVERB_SERVER_PORT:-8080}"
    ;;
  scheduler)
    exec php artisan schedule:work
    ;;
  pulse)
    exec php artisan pulse:work
    ;;
  queue)
    exec php artisan queue:work --sleep=1 --tries=3 --timeout=90
    ;;
  *)
    exec "$@"
    ;;
esac
