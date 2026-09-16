#!/usr/bin/env bash
# Light performance smoke against a running Externa host.
# Usage: BASE_URL=http://localhost:8000 EMAIL=… PASSWORD=… ./scripts/perf-smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

time_get() {
  local path="$1"
  curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" -b "$COOKIE_JAR" -c "$COOKIE_JAR" "${BASE_URL}${path}"
}

echo "GET /up"
time_get /up
echo "GET /health/ready"
time_get /health/ready
echo "GET /login"
time_get /login

echo "Done. For authenticated paths, log in via browser/session and extend this script."
