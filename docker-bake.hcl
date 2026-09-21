# Buildx bake — multi-arch Externa images (linux/amd64 + linux/arm64).
# Usage:
#   docker buildx bake -f docker-bake.hcl production
#   REGISTRY=ghcr.io/qiick-io/externa-core VERSION=1.0.0-beta.4 \
#     docker buildx bake -f docker-bake.hcl production --push
#
# Local single-arch (faster):
#   docker build --target production -t externa:prod .

variable "REGISTRY" {
  default = "ghcr.io/qiick-io/externa-core"
}

variable "VERSION" {
  default = "dev"
}

variable "TAG" {
  default = "externa:prod"
}

variable "DEV_TAG" {
  default = "externa:dev"
}

group "default" {
  targets = ["production"]
}

target "production" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "production"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags = [
    "${TAG}",
    "${REGISTRY}:${VERSION}",
    "${REGISTRY}:latest",
  ]
}

target "development" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "development"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${DEV_TAG}"]
}
