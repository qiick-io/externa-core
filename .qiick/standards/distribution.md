<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Self-hosted app distribution

For apps a customer installs (not for Composer packages, which ship with plain `composer require` / `update`). externa-core is the reference implementation. In short: install with `composer create-project qiick/<app>` and `php artisan <app>:install`, update with `php artisan <app>:upgrade` (never `create-project`).

1. **Install from Packagist:** `composer create-project qiick/<app>`. `create-project` only copies `.env` and runs `key:generate`: no migrate, seed or database assumption.
2. **First run:** `php artisan <app>:install`, interactive (database, name / URL, stack profile, optional seed, frontend build), with a non-interactive mode for CI (`--no-interaction --force`).
3. **Updates:** `php artisan <app>:upgrade` (migrate, permissions, caches, version-specific steps), plus opt-in `--sync-upstream=vX.Y.Z` with `--dry-run`. `create-project` is never the update channel, and the README says so.
4. **Docker:** `ghcr.io/qiick-io/<repo>` (for example `ghcr.io/qiick-io/externa-core`), linux/amd64 and arm64, published by the release workflow on a `v*` tag only, tagged `X.Y.Z` and `latest` for a stable release, only `X.Y.Z-beta.N` / `X.Y.Z-rc.N` for a pre-release (externa-core `docker.yml`, job `ghcr-publish`); a Compose quick start; `GET /health/live` and `GET /health/ready`.
5. **Docs:** a docs site (`docs.<app>.qiick.io`, or `docs/` in the repo until it exists) with installation (Composer, Docker), configuration, upgrade and backup pages, and an "Upgrade notes" section for every version in the `CHANGELOG`.
6. **Packagist** (first release, by the maintainer): the package `qiick/<repo>` with the GitHub hook, `"type": "project"`, `license`, `support` (issues, source, docs) and keywords in `composer.json`; `composer create-project qiick/<repo>` tested from a clean machine before the release is announced.
7. **CI smoke** (`qiick-io/app-ui/.github/workflows/app-distribution-smoke.yml`, check `distribution-smoke / smoke`): `create-project` from the current `develop`, non-interactive install, health endpoints, and an upgrade from the previous tag. An app whose install needs more than the workflow does (excubia-app: its core package and first-run wizard, `scripts/e2e/install-upgrade.sh`) may keep its own job, as long as it covers the same four steps; it says so in its own `AGENTS.md` section.
