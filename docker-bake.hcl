# Buildx bake — multi-arch Externa images (linux/amd64 + linux/arm64).
# Usage:
#   docker buildx bake -f docker-bake.hcl production
#   docker buildx bake -f docker-bake.hcl production --push   # needs GHCR login + tags
#
# Local single-arch (faster): omit platforms / use native:
#   docker build --target production -t externa:prod .

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
  tags       = ["${TAG}"]
}

target "development" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "development"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${DEV_TAG}"]
}
