#!/usr/bin/env bash
# Multi-arch build helper (amd64 + arm64). Fails if either platform fails.
# Does not push by default. Optional: PUSH=1 TAG=ghcr.io/qiick-io/externa-core:dev ./scripts/docker-buildx.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-production}"
TAG="${TAG:-externa:prod}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

docker buildx version >/dev/null
docker buildx inspect externa-multiarch >/dev/null 2>&1 \
  || docker buildx create --name externa-multiarch --driver docker-container --use
docker buildx use externa-multiarch
docker buildx inspect --bootstrap >/dev/null

ARGS=(build --platform "$PLATFORMS" --target "$TARGET" -t "$TAG")
if [[ "${PUSH:-0}" == "1" ]]; then
  ARGS+=(--push)
else
  ARGS+=(--load)
  # --load only supports one platform; for multi-arch without push, use bake (stores in buildx cache)
  if [[ "$PLATFORMS" == *","* ]]; then
    echo "Multi-platform without PUSH=1: using bake (no local --load)."
    TAG="$TAG" docker buildx bake -f docker-bake.hcl "$TARGET"
    echo "Bake OK for platforms in docker-bake.hcl ($TARGET)."
    exit 0
  fi
fi

docker buildx "${ARGS[@]}" .
echo "Build OK: $TAG ($PLATFORMS) target=$TARGET"
