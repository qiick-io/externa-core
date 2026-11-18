#!/usr/bin/env bash
#
# Install and upgrade smoke test, as an operator does it (#794; ported from excubia-app).
#
# 1. `composer create-project` from this checkout (a path repository standing in for
#    Packagist): only `.env` and `APP_KEY`, no database.
# 2. `php artisan externa:install -n`: migrations, roles and the super admin seeded, assets built.
# 3. The app answers /health/ready, /health/live and /login.
# 4. `php artisan externa:upgrade --force` runs on the installed tree.
# 5. The previous release (the latest v* tag on main) is installed from Packagist and filled
#    with the upgrade fixtures (tests/Support/ReleaseUpgradeFixtures.php); a new tree of this
#    checkout takes over its .env and database and runs `externa:upgrade`. Afterwards no row
#    may be lost or rewritten beyond what the migrations document, and the app must answer.
#
# Usage: scripts/e2e/install-upgrade.sh [sqlite|mysql|mariadb|pgsql]   (from the repo root)
#
# On MySQL, MariaDB and PostgreSQL the database must exist and is wiped: SMOKE_DB_HOST
# (127.0.0.1), SMOKE_DB_PORT (3306 / 5432), SMOKE_DB_DATABASE (externa_core), SMOKE_DB_USERNAME
# (root), SMOKE_DB_PASSWORD (empty). SMOKE_PREVIOUS_TAG overrides the release to upgrade from.
# Needs PHP, Composer, Node and git with main and the tags fetched.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONNECTION="${1:-sqlite}"
WORK="$(mktemp -d)"
PORT="${SMOKE_PORT:-8765}"
SERVER_PID=""

case "$CONNECTION" in
    sqlite) ;;
    mysql | mariadb) DEFAULT_DB_PORT=3306 ;;
    pgsql) DEFAULT_DB_PORT=5432 ;;
    *) printf 'Unknown connection: %s (sqlite, mysql, mariadb or pgsql)\n' "$CONNECTION" >&2; exit 2 ;;
esac

cleanup() {
    local status=$?
    if [ -n "$SERVER_PID" ]; then
        pkill -P "$SERVER_PID" 2>/dev/null || true
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    # `php artisan serve` workers may still be writing logs: the clean-up never fails the run.
    rm -rf "$WORK" 2>/dev/null || true
    exit "$status"
}
trap cleanup EXIT

step() { printf '\n==> [%s] %s\n' "$CONNECTION" "$1"; }
fail() { printf 'FAIL [%s]: %s\n' "$CONNECTION" "$1" >&2; exit 1; }

# The package source: the files git would commit (tracked and new, without vendor, node_modules
# or build output), so the path repository copies a clean tree and not a developer's checkout.
export_source() {
    mkdir -p "$WORK/source"
    (cd "$ROOT" && git ls-files -z --cached --others --exclude-standard \
        | while IFS= read -r -d '' file; do [ -e "$file" ] && printf '%s\0' "$file"; done \
        | tar --null -T - -cf -) | tar -xf - -C "$WORK/source"
}

create_project() {
    local target="$1"
    composer create-project qiick/externa-core "$target" dev-smoke \
        --repository="{\"type\":\"path\",\"url\":\"$WORK/source\",\"options\":{\"symlink\":false,\"versions\":{\"qiick/externa-core\":\"dev-smoke\"}}}" \
        --stability=dev --no-interaction --prefer-dist --no-progress
}

set_env() {
    local file="$1" key="$2" value="$3"
    if grep -qE "^#? ?${key}=" "$file"; then
        sed -i.bak -E "s|^#? ?${key}=.*|${key}=${value}|" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >>"$file"
    fi
}

# `externa:install` asks for the database with a prompt that `-n` always answers with SQLite.
# On another engine the tree is pointed at it afterwards and gets the same migrate and seed
# the installer runs, on an emptied database.
install_tree() {
    local dir="$1"
    shift
    (cd "$dir" && php artisan externa:install -n --force "$@")

    if [ "$CONNECTION" != sqlite ]; then
        set_env "$dir/.env" DB_CONNECTION "$CONNECTION"
        set_env "$dir/.env" DB_HOST "${SMOKE_DB_HOST:-127.0.0.1}"
        set_env "$dir/.env" DB_PORT "${SMOKE_DB_PORT:-$DEFAULT_DB_PORT}"
        set_env "$dir/.env" DB_DATABASE "${SMOKE_DB_DATABASE:-externa_core}"
        set_env "$dir/.env" DB_USERNAME "${SMOKE_DB_USERNAME:-root}"
        set_env "$dir/.env" DB_PASSWORD "${SMOKE_DB_PASSWORD:-}"
        (cd "$dir" && php artisan db:wipe --force && php artisan migrate --force && php artisan db:seed --force)
    fi
}

# `php artisan serve` forks PHP workers: stop the whole group, not only the parent.
stop_server() {
    pkill -P "$SERVER_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
}

serve_and_probe() {
    local dir="$1"
    (cd "$dir" && exec php artisan serve --host=127.0.0.1 --port="$PORT" >/dev/null 2>&1) &
    SERVER_PID=$!

    for _ in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:$PORT/health/ready" >/dev/null 2>&1; then
            curl -fsS "http://127.0.0.1:$PORT/health/live" >/dev/null || fail "/health/live"
            curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" || fail "/login"
            stop_server
            return 0
        fi
        sleep 1
    done

    curl -sS "http://127.0.0.1:$PORT/health/ready" >&2 || true
    fail "the app did not answer /health/ready"
}

assert_installed() {
    local dir="$1"
    (cd "$dir" && php artisan migrate:status --no-ansi | grep -q Pending) && fail "pending migrations in $dir"
    local counts
    counts="$(cd "$dir" && php artisan tinker --execute 'echo json_encode(["connection" => DB::getDriverName(), "permissions" => DB::table("permissions")->count(), "roles" => DB::table("roles")->count(), "users" => DB::table("users")->count()]);')"
    echo "$counts" | grep -q "\"connection\":\"$CONNECTION\"" || fail "not installed on $CONNECTION ($counts)"
    echo "$counts" | grep -qE '"(permissions|roles|users)":0' && fail "permissions, roles or the super admin missing ($counts)"
    return 0
}

step "composer create-project (from this checkout)"
export_source
create_project "$WORK/app"
[ -f "$WORK/app/.env" ] || fail "create-project did not copy .env"
grep -q '^APP_KEY=base64:' "$WORK/app/.env" || fail "create-project did not set APP_KEY"
[ ! -f "$WORK/app/database/database.sqlite" ] || fail "create-project must not create the database"

step "php artisan externa:install -n"
install_tree "$WORK/app"
assert_installed "$WORK/app"
serve_and_probe "$WORK/app"

step "php artisan externa:upgrade --force (same release)"
(cd "$WORK/app" && php artisan externa:upgrade --force)
assert_installed "$WORK/app"

PREVIOUS="${SMOKE_PREVIOUS_TAG:-}"
for main_ref in origin/main main; do
    if [ -z "$PREVIOUS" ]; then
        PREVIOUS="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' "$main_ref" 2>/dev/null || true)"
    fi
done

if [ -z "$PREVIOUS" ]; then
    step "No release tag on main: skipping the upgrade from the previous release"
    exit 0
fi

step "Install the previous release $PREVIOUS from Packagist"
composer create-project "qiick/externa-core:${PREVIOUS#v}" "$WORK/previous" \
    --no-interaction --prefer-dist --no-progress
install_tree "$WORK/previous" --no-npm
assert_installed "$WORK/previous"

step "Fill $PREVIOUS with the data the pending migrations read"
PENDING_MIGRATIONS=()
while IFS= read -r migration; do
    PENDING_MIGRATIONS+=("$migration")
done < <(comm -13 \
    <(ls "$WORK/previous/database/migrations" | sed 's/\.php$//' | sort) \
    <(ls "$ROOT/database/migrations" | sed 's/\.php$//' | sort))
printf 'Pending migrations: %s\n' "${#PENDING_MIGRATIONS[@]}"
php "$ROOT/scripts/e2e/upgrade-fixtures.php" seed "$WORK/previous" "$WORK/snapshot.json" ${PENDING_MIGRATIONS[@]+"${PENDING_MIGRATIONS[@]}"}

step "Upgrade $PREVIOUS to this checkout (new tree, same .env and database)"
create_project "$WORK/next"
cp "$WORK/previous/.env" "$WORK/next/.env"
if [ "$CONNECTION" = sqlite ]; then
    cp "$WORK/previous/database/database.sqlite" "$WORK/next/database/database.sqlite"
    sed -i.bak "s#^DB_DATABASE=.*#DB_DATABASE=$WORK/next/database/database.sqlite#" "$WORK/next/.env"
fi
(cd "$WORK/next" && npm ci --no-audit --no-fund && php artisan wayfinder:generate --with-form && npm run build && php artisan externa:upgrade --force)
assert_installed "$WORK/next"
php "$ROOT/scripts/e2e/upgrade-fixtures.php" verify "$WORK/next" "$WORK/snapshot.json"
serve_and_probe "$WORK/next"

step "Install and upgrade smoke passed"
