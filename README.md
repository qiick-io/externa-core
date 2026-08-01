# Externa

Externa is a headless CMS / content API with an operator admin UI. **Version:** `1.0.0-beta.1` (from `composer.json`; mirrored in `package.json`). Manage **dynamic collections**, a **hierarchical file tree**, and **RBAC** (roles, groups, effective permissions), then expose content to websites via the **Public CMS API** (`/api/v1`) and **GraphQL** (`/api/graphql`). An optional in-app AI assistant (OpenAI-compatible / LM Studio) respects the signed-in user’s permissions.

Stack: **Laravel 13**, **Inertia + React 19**, Vite, Spatie Permission / Activitylog, Wayfinder typed routes.

Full documentation lives in the sibling **[externa-docs](../externa-docs)** site (run it locally on port 3001, or browse the Markdoc pages under `src/app/docs/`). Start with [Installation](../externa-docs/src/app/docs/installation/page.md) and [Minimal vs full stack](../externa-docs/src/app/docs/minimal-vs-full-stack/page.md).

## Requirements

| Requirement | Notes |
| --- | --- |
| **PHP 8.4+** | Pinned in `.php-version` / `composer.json` (`^8.4`). Herd PHP 8.4 recommended on macOS. |
| **Composer 2** | PHP dependencies and `composer setup` / `composer run dev`. |
| **Node.js 24** | Pinned in `.nvmrc` and `package.json` `engines`. Use `nvm use` (or equivalent). |
| **SQLite** (default) | Or MySQL / Postgres via `DB_*`. |
| **Redis** (optional) | Needed for Horizon, Reverb-friendly realtime, and Pulse redis ingest. |

Optional: [Laravel Herd](https://herd.laravel.com) (PHP, nginx, `.test` hosts; Pro adds shared Reverb on `:8080`). Optional AI: an OpenAI-compatible gateway (e.g. [LM Studio](https://lmstudio.ai)) at `LOCAL_AI_URL`.

## Quick start

```bash
git clone <your-fork-or-remote> externa-core
cd externa-core
nvm use   # Node 24

cp .env.example .env
# Edit .env: set APP_URL (Herd host if used). For no Redis, see “Minimal vs full” below.

touch database/database.sqlite   # if missing (SQLite default)

composer install
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan storage:link

npm install
php artisan wayfinder:generate --with-form --no-interaction
npm run build   # or skip and rely on `npm run dev` / Vite HMR
```

**Shortcut:** `composer setup` runs install → copy `.env` if missing → `key:generate` → migrate → `npm install` → `npm run build`. Still run `db:seed`, `storage:link`, and Wayfinder (or let Vite generate routes on first `npm run dev`).

### Run locally

**Minimal** (no Redis — set `QUEUE_CONNECTION=database` and `BROADCAST_CONNECTION=log` in `.env`):

```bash
composer run dev
# serve + queue:listen + pail + vite
```

Or with Herd serving the site: keep Vite + a queue worker (`php artisan queue:listen --tries=1 --timeout=0`).

**Full stack** (Redis + realtime + Pulse — matches `.env.example` defaults):

1. Enable Redis (and Herd Pro Reverb on `:8080` if available).
2. Keep `QUEUE_CONNECTION=redis`, `BROADCAST_CONNECTION=reverb`, and Reverb/Pulse keys from `.env.example`.
3. Start workers (Herd Reverb is already up — do **not** also `reverb:start` on the same port):

```bash
php artisan horizon
php artisan pulse:work
npm run dev
```

Standalone all-in-one (starts its own Reverb — conflicts if Herd already binds `:8080`):

```bash
composer run dev:full
```

Open `APP_URL` (Herd host or `php artisan serve`). Unauthenticated `/` redirects to login.

### First login (local / dev only)

`php artisan db:seed` creates permissions, roles (`super-admin`, `admin`, `reader`, `public`), and a super admin from `config/super_admin.php`:

| | Default |
| --- | --- |
| Email | `superadmin@example.com` |
| Password | `password` |

Override with `INITIAL_SUPER_ADMIN_*` in `.env` **before** seeding. **Local/dev only** — change or remove before any shared or production deploy.

## Important environment variables

Copy from `.env.example` and tune. Full reference: [Environment variables](../externa-docs/src/app/docs/environment-variables/page.md).

| Group | Keys (curated) | Notes |
| --- | --- | --- |
| **App** | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL` | `APP_URL` must match how you browse. **HTTP is fine** for password login, TOTP 2FA, and the rest of the CMS. **Passkeys / WebAuthn** need a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): HTTPS, or `http://localhost` / `http://*.localhost`. Plain `http://externa-core.test` is not secure — browsers hide `PublicKeyCredential` (expected, not a Brave bug). Local fix: `herd secure externa-core`, `APP_URL=https://externa-core.test`, keep Vite `detectTls: 'externa-core.test'` so `public/hot` is `https://externa-core.test:5173` (not `127.0.0.1` — blank/black screen via mixed content / bad cert SAN), hard refresh; clear http+https cookies if the session is weird. Docs: [Passkeys](../externa-docs/src/app/docs/passkeys/page.md). |
| **Database** | `DB_CONNECTION` (+ `DB_*` if not SQLite) | Default `sqlite`. |
| **Session / cache** | `SESSION_DRIVER`, `CACHE_STORE` | Default `database`. |
| **Queue** | `QUEUE_CONNECTION` | Full: `redis` + Horizon. Minimal: `database` + `queue:listen`. |
| **Redis** | `REDIS_CLIENT`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Required for Horizon / Pulse redis ingest. |
| **Broadcast / Reverb** | `BROADCAST_CONNECTION`, `REVERB_*`, `VITE_REVERB_*` | Full: `reverb`. Minimal: `log` (60s notification poll). Restart Vite after `VITE_REVERB_*` changes. |
| **Pulse** | `PULSE_ENABLED`, `PULSE_INGEST_DRIVER`, `PULSE_*` | Prefer redis ingest + `pulse:work`. Disable with `PULSE_ENABLED=false` when not using Redis. |
| **AI** | `AI_DEFAULT_PROVIDER`, `LOCAL_AI_URL`, `LOCAL_AI_MODEL`, … | Optional; defaults target a local OpenAI-compatible gateway. |
| **Files** | `FILES_DUPLICATE_SYNC_MAX_BYTES`, `FILES_ZIP_*` | Async zip / large duplicate need a queue worker. |

See `.env.example` for every key and inline comments.

## Optional services

| Service | When you need it |
| --- | --- |
| **Horizon** | Redis queues, dashboard Health Horizon cards, `/horizon` (super-admin). |
| **Reverb + Echo** | Live admin notifications, presence / avatar connection indicator. Prefer Herd Pro Reverb locally. |
| **Pulse** | Metrics for dashboard **Health**; full UI at `/pulse`. Needs ingest worker when using redis ingest. |
| **Queue worker** | Always needed for zip downloads, large/bulk duplicates, and collection imports — even on the minimal stack. |

Details: [Redis](../externa-docs/src/app/docs/redis-prerequisite/page.md) · [Horizon](../externa-docs/src/app/docs/horizon/page.md) · [Reverb](../externa-docs/src/app/docs/reverb-and-echo/page.md) · [Pulse](../externa-docs/src/app/docs/pulse-and-health/page.md) · [Operations](../externa-docs/src/app/docs/operations/page.md).

## Tests and quality

Use **Node 24** for frontend checks (`nvm use`).

```bash
composer test          # config:clear + Pint --test + Pest
php artisan test       # Pest only
composer lint          # Pint (fix)
composer lint:check    # Pint --test
composer ci:check      # npm lint/format/types + composer test

npm run lint:check
npm run format:check
npm run types:check
```

Browser tests (Pest + Playwright) live under `tests/Browser/` — see [Testing](../externa-docs/src/app/docs/testing/page.md).

## Related packages

| Package | Role |
| --- | --- |
| [externa-docs](../externa-docs) | Product & ops documentation (Next.js + Markdoc) |
| [externa-website](../externa-website) | Marketing site |
| [externa-bruno](../externa-bruno) | Bruno collection for Public CMS API + GraphQL |

## License

MIT (see `composer.json`).
