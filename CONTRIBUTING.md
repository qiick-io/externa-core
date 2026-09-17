# Contributing to externa-core

Operators who only deploy via Packagist / Docker can ignore this file. **Contributors** developing externa-core should read on.

## Setup

```bash
git clone https://github.com/qiick-io/externa-core.git
cd externa-core
nvm use          # Node 24
composer install
npm ci           # prepare installs Lefthook hooks when .git is present
```

Docs: [Contributing](https://docs.externa.qiick.io/docs/contributing).

## Local git hooks (Lefthook)

| Hook | What runs |
| --- | --- |
| `pre-commit` | Pint on dirty PHP; ESLint + Prettier on staged JS/TS/CSS |
| `commit-msg` | commitlint (Conventional Commits) |
| `pre-push` | `pint --test` + `eslint` — **not** full Pest |

`npm` `prepare` runs `lefthook install` only when `.git` exists (clone/checkout). Docker/`npm ci` without a git checkout no-ops — image builds stay green.

**CI is authoritative.** Hooks can be skipped: `LEFTHOOK=0` or `git commit --no-verify` (emergency only).

Reinstall hooks: `npx lefthook install`.

## Quality gates

```bash
composer lint:check
composer analyse   # Larastan/PHPStan (baseline in phpstan-baseline.neon)
composer test
npm run lint:check && npm run format:check && npm run types:check
```

New PHPStan findings outside the baseline fail CI (`lint` workflow). Regenerate only intentionally: `composer analyse:baseline`.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, …) — aligns with CHANGELOG / release process.

## Release shipping (agents & maintainers)

**Do not auto-ship to `main`.** Opening a `develop` → `main` release PR (full body + assignee + milestone) is fine. **Maintainers** merge that PR, create the `vX.Y.Z` tag, and publish the GitHub Release.

Agents must **not** merge the release PR, create git tags, or run `gh release create` unless the user explicitly asks. Docs: [Releasing & versions](https://docs.externa.qiick.io/docs/releasing).
