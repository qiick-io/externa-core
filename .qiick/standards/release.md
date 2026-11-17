<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Releases: never without the maintainer

`develop` is the integration branch. `main` holds releases only.

Agents may, when asked for a release:

- open a `develop` → `main` release pull request with a full body (changelog, included PRs), then **stop**.

Agents must not, unless the maintainer explicitly says so in this conversation:

- merge a release pull request or anything into `main` / `release/*`;
- bump versions, create tags (`vX.Y.Z` or any other), run `gh release create` or publish a GitHub Release;
- push to `main` / `master` / `release/*`;
- publish packages (Packagist, npm) or images (Docker Hub, GHCR);
- change repository visibility.

How a release goes, for reference: release PR → the maintainer merges it with a **merge commit** (never squash: `main` must stay an ancestor of `develop`) → tag `vX.Y.Z` on the merge commit → GitHub Release titled exactly with the tag, listing the included PRs → `main` is merged back into `develop` through a pull request, also with a merge commit.

## Lifecycle (what the release PR prepares)

- **Versions:** Semantic Versioning. Pre-releases are `vX.Y.Z-beta.N`, then `vX.Y.Z-rc.N`, then `vX.Y.Z`; Composer packages declare them with `@beta` / `@RC` stability. Before `1.0.0` a minor may break; the notes say so.
- **`CHANGELOG.md`:** [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): `[Unreleased]` collects `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security` as PRs land; the release PR moves it to `[X.Y.Z] - YYYY-MM-DD` with an **Upgrade notes** subsection (commands to run, config or env changes, breaking changes, data migrations that take long) and the compare link.
- **Versions in files:** `composer.json` / `package.json` `version`, the app's version constant or config, and the docs site version, bumped in the release PR only.
- **Required checks** on `develop` and `main` (the maintainer sets them; agents ask, and never change them): the repo's own test, lint and type jobs, `pr-title / commitlint`, `app-ui-drift / standards`, `php-quality / php-quality` in PHP repos, and in apps `app-ui-drift / drift`, `ui-quality / ui-quality`, `migrations-frozen / migrations-frozen`, `distribution-smoke / smoke`. Both branches require the same list, with "require branches to be up to date" on. A reusable check is named `<caller job id> / <job>`, so call the shared workflows with exactly these job ids.

## Required checks per repo

The exact names each repo requires on `develop` and on `main` (identical lists). When a repo adds or renames a job, the same PR says which name the maintainer must add or replace; a required check that no workflow reports any more blocks every PR.

| Repo         | Own jobs                                                                                                                         | Shared (app-ui reusable workflows)                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| externa-core | `quality`, `ci (8.4)`, `ci (8.5)`, `ci-mysql`, `ci-mariadb`, `ci-pgsql`, `browser`, `composer-audit`, `npm-audit`                | `pr-title / commitlint`, `app-ui-drift / standards`, `app-ui-drift / drift`, `php-quality / php-quality`, `ui-quality / ui-quality`, `migrations-frozen / migrations-frozen`, `distribution-smoke / smoke` |
| excubia-app  | `PHP 8.4`, `PHP 8.5`, `MySQL`, `PostgreSQL`, `Accessibility`, `Install and upgrade`, `Docker image`, `Core contract (^1.0@beta)` | `pr-title / commitlint`, `app-ui-drift / standards`, `app-ui-drift / drift`, `php-quality / php-quality`, `ui-quality / ui-quality`, `migrations-frozen / migrations-frozen`                               |
| excubia-core | `PHP 8.3 lowest`, `PHP 8.3 stable`, `PHP 8.4 lowest`, `PHP 8.4 stable`, `PHP 8.5 lowest`, `PHP 8.5 stable`                       | `pr-title / commitlint`, `app-ui-drift / standards`, `php-quality / php-quality`                                                                                                                           |
| app-ui       | `lint`, `types`, `build`, `scripts`, `pr-title` (this repo checks PR titles with its own job)                                    | none                                                                                                                                                                                                       |

`php-quality / php-quality` becomes required once the repo calls `php-quality.yml` and its first run is green; until then its own PHPStan step stays required through the jobs above.
