<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Stack

Every qiick app runs the same stack, so code, rules and registry items move between apps unchanged. A new app starts here; an existing app that differs converges on it, one PR per change. Steps from an empty repo to a green CI: https://github.com/qiick-io/app-ui/blob/develop/docs/new-product.md

## Runtime defaults

- **Database:** SQLite by default (install, tests, CI); MySQL 8 and PostgreSQL 17 supported and tested in CI. No vendor-specific SQL outside a driver check.
- **Queue:** the `database` driver by default; **Horizon** (`laravel/horizon`) when Redis is configured. Slow work (mail, AI, imports, webhooks) is a queued `*Job`.
- **Realtime:** **Reverb** (`laravel/reverb`) with `laravel-echo` + `pusher-js`; broadcasting is optional and the UI works without it (realtime badge grey).
- **Cache / session:** `database` by default, Redis when configured.
- **Locales:** `en`, `it`, `de` from the first commit: every UI string through `t('…')`, every key in all three locale files.
- **Self-hosting:** an app is installed with `composer create-project` and `php artisan <app>:install`, updated with `<app>:upgrade` (see the distribution rules).

## Frontend toolchain

**Vite+** (`vite-plus`: `vp dev`, `vp build`, `vp check` with Oxlint and Oxfmt), as the Laravel React starter kit ships it. excubia-app is the reference and sets the lint rules: an app that differs converges on it, never the other way round, and no app moves from Vite+ back to plain Vite, ESLint or Prettier. externa-core still runs ESLint + Prettier and moves to Vite+ in 1.5.0 (externa-core#609).

## Local development

**Laravel Herd** serves the app at `https://<app>.test` (`herd link`, `herd secure`); `composer run dev` starts Vite, the queue worker and Pail. No Sail or Docker for day-to-day work: Docker is the distribution image, not the dev environment.

- **One database per app**, named after it (`externa_core`, `excubia_app`). Local data is disposable: for a clean state, empty and re-seed it (`php artisan migrate:fresh --seed`); never create per-version or per-branch copies. Before dropping a database, check which `.env` files use it. Production databases only when the maintainer says so.
- **Clean up after a task.** Worktrees, clones, Herd sites or workspaces and extra databases are fine while a task needs them; when its PR is merged or the work is dropped, remove them (`git worktree remove`, `herd unlink`, drop the database) after checking for unpushed work.

## Bootstrap

```bash
laravel new <app> --react --pest --npm --database=sqlite --git
```

The Laravel installer with the official **React starter kit** (Inertia, React, TypeScript, Tailwind, shadcn, Fortify, Wayfinder). Same result without the installer: `composer create-project laravel/react-starter-kit <app>`. Do not start from another kit, template or a copy of an existing app.

## Versions (majors are pinned; minors float)

| Layer       | Package                                                                  | Major   |
| ----------- | ------------------------------------------------------------------------ | ------- |
| Runtime     | PHP                                                                      | `^8.4`  |
| Framework   | `laravel/framework`                                                      | 13      |
| Auth        | `laravel/fortify` (+ passkeys, 2FA from the kit)                         | 1       |
| Routes      | `laravel/wayfinder` + `@laravel/vite-plugin-wayfinder`                   | 0.1     |
| Server ↔ UI | `inertiajs/inertia-laravel`, `@inertiajs/react`                          | 3       |
| UI          | `react` / `react-dom`, Tailwind CSS, TypeScript (the kit's major)        | 19 / 4  |
| Primitives  | shadcn (`radix-ui`), `lucide-react`, `sonner` through `@/lib/toast` only | —       |
| i18n        | `i18next` + `react-i18next`                                              | 26 / 17 |
| Tests       | `pestphp/pest`, `pest-plugin-laravel`, `pest-plugin-browser`             | 5       |
| Static      | `larastan/larastan`, `laravel/pint`                                      | 3 / 1   |
| Node        | Node.js (`.nvmrc` `24`, `"engines": { "node": "24.x" }`), npm            | 24      |
| Agents      | `laravel/boost` (dev)                                                    | 2       |

Composer and npm keep caret ranges inside the pinned major; Dependabot (or Renovate) proposes minors and patches; a major bump is its own PR with the maintainer's OK.

## One lint and format toolchain

**Vite+** for TypeScript / React (`vp check`: Oxlint and Oxfmt), **Pint** (`laravel` preset) and **Larastan** for PHP. A new app keeps the starter kit's Vite+ setup as it is (decision of 2026-11-09: a standard that fights the official starter kit costs every new product); an existing app upgrades to it. excubia-app is the reference (`vite.config.ts`, `.oxlintrc.standards.json`, `.oxlintrc.i18n.json`).

- **The pack's ratcheted rules** run in Oxlint from the synced `.oxlintrc.standards.json` (`"oxlint": true` in `qiick-standards.json`): `no-restricted-imports`, `no-restricted-properties` (`navigator.clipboard`), `id-length`, ratcheted by `qiick-ratchet.mjs lint --rule eslint/<rule>`. The i18n ratchet runs Oxlint with `eslint-plugin-i18next` as a JS plugin (`.oxlintrc.i18n.json`).
- **Boolean prefixes** (type-aware `@typescript-eslint/naming-convention`) have no Oxlint equivalent and typescript-eslint does not support TypeScript 7 yet: the rule waits for typescript-eslint. Never downgrade TypeScript or the toolchain to run it.
- **Apps still on ESLint + Prettier** (externa-core until 1.5.0) keep `qiick-standards.eslint.js` (`"eslint": true`) and `npm run lint:standards` with `QIICK_RATCHET=1`, until they move.
- Externa catches up with excubia-app's packages (TypeScript 7, Vite+, Inertia 3, Pest 5 in 1.5.0); excubia-app is never held back to match it.

The quality gate every app exposes as npm scripts: `lint` (`vp check` + `check-ui-tokens`), `types:check` (`tsc --noEmit`), `knip`, `lint:i18n`, `lint:standards`; and in PHP `vendor/bin/pint --test`, `vendor/bin/phpstan analyse`, `php artisan test`.
