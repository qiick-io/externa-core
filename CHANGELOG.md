# Changelog

All notable changes to **Externa Core** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version source of truth: `composer.json` `version` (mirrored in `package.json`).

## [Unreleased]

### Added

- (accumulate here until the next tagged release)

## [1.0.0-beta.2] - 2026-09-16

### Added

- Docker Compose local + production-oriented stacks (`compose.yaml`, `compose.prod.yaml`, multi-stage `Dockerfile`)
- HTTP health probes: `/health/live`, `/health/ready`
- `FILES_DISK` + Flysystem S3 adapter for MinIO / multi-instance uploads
- MySQL, MariaDB, and PostgreSQL Pest jobs in CI
- Duplicate action for non-system roles
- Transactional email branding from Appearance / Project settings
- README product narrative and UI screenshots

### Changed

- Version bumped to `1.0.0-beta.2`

### Upgrade notes

- Prefer S3/MinIO via `FILES_DISK` for multi-container file storage
- Wire LB/Compose checks to `/health/live` and `/health/ready`
- Compose app port defaults to `:8000` — set `COMPOSE_APP_URL` accordingly
- Laravel Herd local workflow unchanged

[Compare v1.0.0-beta.1...v1.0.0-beta.2](https://github.com/qiick-io/externa-core/compare/v1.0.0-beta.1...v1.0.0-beta.2)

## [1.0.0-beta.1] - 2026-09-13

### Added

- First public beta: dynamic collections, hierarchical files, Spatie RBAC + groups
- Public CMS REST API (`/api/v1`) and GraphQL (`/api/graphql`)
- Optional AI assistant, chat hub, activity log, outbound webhooks
- Passkeys / TOTP, threat model docs, operator security checklist
- Minimal vs full stack (Horizon / Reverb / Pulse) paths

> Beta: APIs and schema may still change before GA. See [API 1.x compatibility](https://docs.externa.qiick.io/docs/api-compatibility) once published.

[GitHub Release](https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.1)

[Unreleased]: https://github.com/qiick-io/externa-core/compare/v1.0.0-beta.2...HEAD
[1.0.0-beta.2]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.1
