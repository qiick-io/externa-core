#!/usr/bin/env bash
# Multi-arch build helper (amd64 + arm64). Fails if either platform fails.
# Does not push by default.
#
# Examples:
#   ./scripts/docker-buildx.sh production
#   TAG=externa:prod ./scripts/docker-buildx.sh production
#   PUSH=1 VERSION=1.0.0-beta.4 ./scripts/docker-buildx.sh production
#     → pushes ghcr.io/qiick-io/externa-core:$VERSION (+ :latest via bake tags)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-production}"
TAG="${TAG:-externa:prod}"
VERSION="${VERSION:-dev}"
REGISTRY="${REGISTRY:-ghcr.io/qiick-io/externa-core}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

docker buildx version >/dev/null
docker buildx inspect externa-multiarch >/dev/null 2>&1 \
  || docker buildx create --name externa-multiarch --driver docker-container --use
docker buildx use externa-multiarch
docker buildx inspect --bootstrap >/dev/null

if [[ "${PUSH:-0}" == "1" ]]; then
  echo "Pushing multi-arch to ${REGISTRY}:${VERSION} (and bake tags)..."
  TAG="$TAG" VERSION="$VERSION" REGISTRY="$REGISTRY" \
    docker buildx bake -f docker-bake.hcl "$TARGET" --push
  echo "Push OK: ${REGISTRY}:${VERSION}"
  exit 0
fi

if [[ "$PLATFORMS" == *","* ]]; then
  echo "Multi-platform without PUSH=1: using bake (no local --load)."
  TAG="$TAG" VERSION="$VERSION" REGISTRY="$REGISTRY" \
    docker buildx bake -f docker-bake.hcl "$TARGET"
  echo "Bake OK for platforms in docker-bake.hcl ($TARGET)."
  exit 0
fi

docker buildx build --platform "$PLATFORMS" --target "$TARGET" -t "$TAG" --load .
echo "Build OK: $TAG ($PLATFORMS) target=$TARGET"
