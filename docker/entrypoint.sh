#!/usr/bin/env bash
set -euo pipefail

role="${1:-app}"

cd /var/www/html

mkdir -p storage/framework/{cache/data,sessions,views} storage/logs storage/app/{public,private,zips,tmp} bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
chmod -R ug+rwx storage bootstrap/cache 2>/dev/null || true

# Bind :80 immediately so host-published ports accept TCP while composer/migrate run.
# Docker marks the container "running" as soon as entrypoint starts; without this,
# browsers see ERR_CONNECTION_REFUSED until nginx finally starts (minutes on cold vendor).
# Mid-boot may be 502 (no php-fpm yet) — not connection refused.
stop_nginx_daemon() {
  if [[ -f /run/nginx.pid ]] || [[ -f /var/run/nginx.pid ]]; then
    nginx -s quit 2>/dev/null || true
    for _ in $(seq 1 25); do
      [[ -f /run/nginx.pid || -f /var/run/nginx.pid ]] || break
      sleep 0.2
    done
  fi
}

if [[ "$role" == "app" ]]; then
  nginx 2>/dev/null || true
fi

if [[ -f artisan ]]; then
  # Dev bind-mount: only the app role installs into the named vendor volume;
  # sibling workers wait so parallel composer installs cannot corrupt the archive cache.
  if [[ "${APP_ENV:-local}" != "production" && -f composer.json ]]; then
    if [[ "$role" == "app" ]]; then
      if [[ ! -f vendor/autoload.php ]]; then
        echo "Installing Composer dependencies..."
        composer install --no-interaction --prefer-dist --optimize-autoloader
      fi
    else
      echo "Waiting for vendor/autoload.php..."
      for i in $(seq 1 180); do
        [[ -f vendor/autoload.php ]] && break
        sleep 1
      done
    fi
    if [[ ! -f vendor/autoload.php ]]; then
      echo "vendor/autoload.php missing" >&2
      exit 1
    fi
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
    stop_nginx_daemon
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
