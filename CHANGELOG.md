# Changelog

All notable changes to **Externa Core** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version source of truth: `composer.json` `version` (mirrored in `package.json`).

## [Unreleased]

## [1.2.1] - 2026-10-21

### Fixed

- Renaming a field no longer drops its value from pending drafts and older revisions (#218)

### Security

- `package-lock.json` bump: `follow-redirects` 1.16.0 → 1.16.1 ([GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c)); `vite` 8.3.0 → 8.3.5 (via `launch-editor`: [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)) so `npm audit --omit=dev --audit-level=high` passes

### Upgrade notes

- After deploying 1.2.1, repair drafts/revisions still holding a pre-rename field key (from renames before this fix):
  1. Dry-run (default): `php artisan externa:repair-renamed-field-drafts`
  2. Apply: `php artisan externa:repair-renamed-field-drafts --apply`
  - Mappings come from CollectionField activity-log rename history; pass `--map=collection:old=new` (slug or id; repeatable) for orphans with no history. Never overwrites a value already under the new key. Publish-time behavior is unchanged.

## [1.2.0] - 2026-10-18

### Added

- Official headless starter conventions: multi-repo preferred, naming/env/TS/CI/Dependabot checklist in `docs/starters.md` (#156)
- Official Nuxt headless starter: [qiick-io/externa-nuxt-starter](https://github.com/qiick-io/externa-nuxt-starter) + docs [Headless starter](https://docs.externa.qiick.io/docs/headless-starter) (#152)
- Editorial approvals for versioned collections: `approvals_required`, submit/approve/reject, promote gate, review list filter, webhook events `item.submitted`/`item.approved`/`item.rejected`, Spatie `can-submit-collections` / `can-approve-collections` (#48)
- Side-by-side translation workspace on the item form (source/target locales, copy helpers, completeness) (#49)
- Collection list layouts: optional kanban (select/radio) and calendar (date); table remains default (#47)
- Items list toolbar filters; kanban lazy-load columns + DnD persist via `board_sort`; calendar multi-view with drag-to-reschedule; dark-mode contrast polish (#193)
- AI field translate on the item form (`ContentTranslator` + translate endpoint; TipTap/markdown remount via value overrides) (#193)
- Outbound Slack (incoming webhook) and Telegram (`sendMessage`) notifiers on the domain event bus; encrypted Telegram token (#39)
- Notifier messages enriched with title, actor, status, and admin link; Project settings can mute event types (`notifier_event_types`, null = all events)
- Collaborative item presence + soft lock via Echo (avatars, whisper lock, stale-save / `expected_updated_at`) (#50)
- Optional Meilisearch sync for published collection items (queue jobs; no Scout/Algolia; Compose profile `meilisearch`) (#40)
- Optional git export sync of published items to a remote (JSON/Markdown, deploy-key SSH, dry-run) (#41)
- CMS import profiles on `ImportRemoteJson`: `directus` and `wordpress` reshape before flatten/import (#30)
- Optional OIDC/SSO login (Socialite + issuer discovery): project settings for issuer/client/secret, link-by-verified-email (JIT off by default), login CTA alongside password/passkey (#29)
- Optional Keycloak Compose QA profile (`compose.oidc.yaml`) for local SSO round-trips without baking an IdP into the default stack

### Changed

- New dependency `laravel/socialite` `^5.31` (#29)
- Telegram notifier test in Project settings runs synchronously and surfaces Bot API errors in flash; token must match BotFather format `123456:ABC…` (#183)
- Telegram messages use `parse_mode=HTML`; Slack keeps mrkdwn
- Project settings: single notifier/webhook event-type checklist (drop duplicate catalog table) (#199)

### Fixed

- Meilisearch: create index with `primaryKey=id` and pass `primaryKey` on upserts (documents were silently not indexed) (#179)
- Git export: clone uses `--template=` (sandboxed filesystems) (#179); empty bare remotes bootstrapped with init + first push (#182)
- OIDC: callback validation errors redirect to login instead of looping back to the IdP; SSO reject errors shown on the login page
- AI field translate applies to React controlled state (TipTap/markdown), not DOM `.value` alone (#193)

### Security

- `package-lock.json` bump (`concurrently` / `shell-quote`, `source-map-js`) so `npm audit --omit=dev --audit-level=high` passes (#182)
- OIDC client secret and Telegram bot token stored encrypted (#29, #39)

## [1.1.0] - 2026-09-24

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
- Admin i18n: sync `de` missing keys, `common.export` / `a11y.*` labels, locale key parity test (#27)

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
