# Contributing to externa-core

Operators who only deploy via Packagist / Docker can ignore this file. **Contributors** developing externa-core should read on.

## Setup

```bash
git clone https://github.com/qiick-io/externa-core.git
cd externa-core
nvm use          # Node 24
composer install
npm ci           # also installs Lefthook git hooks via prepare
```

Docs: [Contributing](https://docs.externa.qiick.io/docs/contributing).

## Local git hooks (Lefthook)

| Hook | What runs |
| --- | --- |
| `pre-commit` | Pint on dirty PHP; ESLint + Prettier on staged JS/TS/CSS |
| `commit-msg` | commitlint (Conventional Commits) |
| `pre-push` | `pint --test` + `eslint` — **not** full Pest |

**CI is authoritative.** Hooks can be skipped: `LEFTHOOK=0` or `git commit --no-verify` (emergency only).

Reinstall hooks: `npx lefthook install`.

## Quality gates

```bash
composer lint:check
composer test
npm run lint:check && npm run format:check && npm run types:check
```

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, …) — aligns with CHANGELOG / release process.
