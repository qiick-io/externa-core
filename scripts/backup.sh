#!/usr/bin/env bash
# Thin backup helper for self-hosted Externa.
# Dumps DB (when client tools exist) + tars storage/app into ./backups/.
# Does not print or commit secrets. Review before enabling cron.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p backups
STAMP="$(date +%F-%H%M%S)"
OUT="backups/externa-${STAMP}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_CONNECTION="${DB_CONNECTION:-sqlite}"

case "$DB_CONNECTION" in
  sqlite)
    SQLITE_PATH="${DB_DATABASE:-database/database.sqlite}"
    if [[ "$SQLITE_PATH" != /* ]]; then
      SQLITE_PATH="$ROOT/$SQLITE_PATH"
    fi
    if [[ -f "$SQLITE_PATH" ]]; then
      cp "$SQLITE_PATH" "${OUT}.sqlite"
      echo "Wrote ${OUT}.sqlite"
    else
      echo "WARN: sqlite file missing: $SQLITE_PATH" >&2
    fi
    ;;
  pgsql|postgres|postgresql)
    if command -v pg_dump >/dev/null 2>&1; then
      PGPASSWORD="${DB_PASSWORD:-}" pg_dump -Fc \
        -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" \
        -U "${DB_USERNAME:-externa}" -d "${DB_DATABASE:-externa}" \
        -f "${OUT}.dump"
      echo "Wrote ${OUT}.dump"
    else
      echo "WARN: pg_dump not installed; skipped DB dump" >&2
    fi
    ;;
  mysql|mariadb)
    if command -v mysqldump >/dev/null 2>&1; then
      mysqldump -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
        -u "${DB_USERNAME:-externa}" ${DB_PASSWORD:+-p"$DB_PASSWORD"} \
        --single-transaction --routines --triggers \
        "${DB_DATABASE:-externa}" > "${OUT}.sql"
      echo "Wrote ${OUT}.sql"
    else
      echo "WARN: mysqldump not installed; skipped DB dump" >&2
    fi
    ;;
  *)
    echo "WARN: unsupported DB_CONNECTION=$DB_CONNECTION; skipped DB dump" >&2
    ;;
esac

if [[ -d storage/app ]]; then
  tar -czf "${OUT}-storage.tar.gz" storage/app
  echo "Wrote ${OUT}-storage.tar.gz"
fi

echo "Done. Keep .env backups offline separately — this script does not copy .env."
