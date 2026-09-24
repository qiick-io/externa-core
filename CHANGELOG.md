# Changelog

All notable changes to **Externa Core** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version source of truth: `composer.json` `version` (mirrored in `package.json`).

## [Unreleased]

### Added

- Opt-in `externa:upgrade --sync-upstream=vX.Y.Z` (dry-run / confirm / merge from official `upstream`; default upgrade still does not pull code) (#133)
- AI assistant asks for approval (Approve / Reject in the chat) before destructive tool actions: delete, force-delete, bulk delete, delete field, and AI turn rollback (#144)
- Outbound webhooks: frozen event catalog in Project settings, last success/error + recent delivery log, Make/n8n/Zapier recipes in docs (#35)
- Official Next.js headless starter: [qiick-io/externa-next-starter](https://github.com/qiick-io/externa-next-starter) + docs [Headless starter](https://docs.externa.qiick.io/docs/headless-starter) (#36)
- Live Preview URL: per-collection (or project default) frontend template with signed short-lived `{{token}}`; item toolbar opens preview; `GET /api/v1/preview` for frontends (#42)
- Draft / publish UX: form/list badges, discard endpoint, `has_draft` filter, revision empty copy (#43)
- Scheduled publish/unpublish for versioned items: `publish_at` / `unpublish_at`, `collections:process-schedules`, item form UI, `item.published` webhook (#44)
- Public CMS OpenAPI 3 at `GET /api/v1/openapi.json` (YAML source of truth in `resources/openapi/public-cms-v1.yaml`; keep docs `client-types/openapi.yaml` in sync) (#25)
- Field conditions: `contains`, `gt`/`gte`/`lt`/`lte`, `in`/`not_in`, and flat OR logic; PHP↔TS parity fixtures (#45)
- Accessibility: keyboard-reachable password toggle, aria-labels on critical search/OTP/icon controls; Pest Browser axe on login + profile (#26)
- Activity log CSV/JSON export with current filters (streamed, 10k row cap) (#28)

### Changed

- Upgrade `laravel/ai` to `^1.0`: conversations use a polymorphic participant, and messages store `steps` + `status` instead of `tool_calls` / `tool_results`. Run `php artisan migrate` to convert existing AI chat history (#144)
- Dependency refresh: Composer minors (larastan, boost, fortify, horizon, reverb, sail) + npm patch/minor (`ncu --target minor`). Skipped majors: inertia-laravel/react v3, Pest v5, spatie/laravel-permission v8, eslint 10, TypeScript 7, lucide-react v1. Pinned `eslint-plugin-react-hooks` at `^7.0.1` (7.1.x `preserve-manual-memoization` fails lint) (#145)

## [1.0.0] - 2026-09-17

### Added

- Docker deploy DX: GHCR multi-arch publish on `v*` tags, `compose.quick.yaml` pull path, gated `RUN_SEED` first-boot, healthchecks on quick Compose (#56)

### Changed

- Extract chunk upload flow into `FileChunkUploadService` (#89)
- README install path: stable Packagist `create-project` → `externa:install` (no auto-migrate); Herd / Docker / health links

### Fixed

- File manager grid covers clip correctly; 512px thumbs for preview quality (#105 / #104)

### Security

- Outbound webhooks refuse delivery when the signing secret is empty (no empty-key HMAC) (#88)

## [1.0.0-beta.4] - 2026-09-17

### Changed

- create-project Composer post-scripts stay minimal (handoff to `externa:install`; no auto-migrate/SQLite assumption) (#93)
- npm `prepare` no-ops Lefthook without `.git` (Docker `image-build` green) (#94)
- Dependency refresh within constraints; skipped reckless majors documented in #95

### Fixed

- Docker `php-base`: pin phpredis `6.3.0` from GitHub tarball (bypass flaky `pecl install redis` / `No releases available for package "pecl.php.net/redis"` on multiarch-bake)

### Security

- Private effective files use non-public `private_assets` disk; block SVG/HTML/HTM uploads (#84, #85)
- AI collection-import webhook requires HMAC over body + `collection_id` (#86)

### Added

- Larastan/PHPStan level 5 + baseline in CI lint gate (#87)
- Release shipping ownership docs (no agent auto-merge to `main`) (#92)

## [1.0.0-beta.3] - 2026-09-16

### Added

- Packagist/create-project docs path; upgrade + backup runbooks; production without Redis
- Multi-arch Docker bake; managed Compose overlay; reverse proxy cookbook
- Lefthook/commitlint; `externa:install` / `externa:upgrade`
- AI ManageRoles duplicate; embeddings-backed SearchSimilar; Dev Container; GA readiness notes


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

[Unreleased]: https://github.com/qiick-io/externa-core/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0
[1.0.0-beta.4]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.4
[1.0.0-beta.2]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.1
