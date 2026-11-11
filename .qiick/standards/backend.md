<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Backend conventions

How the five layers look in a qiick app. Each topic has a page with the externa-core (or excubia-app) files to copy; read it before touching that area.

| Topic                                                  | Page                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Auth pages, 2FA, passkeys, SSO through Signaculum      | https://github.com/qiick-io/app-ui/blob/develop/docs/auth.md                  |
| Roles, permissions, policies, `<app>:sync-permissions` | https://github.com/qiick-io/app-ui/blob/develop/docs/roles-and-permissions.md |
| Error pages 403 / 404 / 500 / 503                      | https://github.com/qiick-io/app-ui/blob/develop/docs/error-pages.md           |
| REST API, OpenAPI, API keys and scopes                 | https://github.com/qiick-io/app-ui/blob/develop/docs/api.md                   |
| Realtime: Reverb, channels, presence                   | https://github.com/qiick-io/app-ui/blob/develop/docs/realtime.md              |
| Security headers                                       | https://github.com/qiick-io/app-ui/blob/develop/docs/security-headers.md      |
| Logging and activity (audit) log                       | https://github.com/qiick-io/app-ui/blob/develop/docs/logging-and-audit.md     |
| AI backend: providers, tools, approvals                | https://github.com/qiick-io/app-ui/blob/develop/docs/ai-backend.md            |

## Requests and controllers

- Every write takes a `FormRequest` in `app/Http/Requests/<Area>/`: `Store<Model>Request`, `Update<Model>Request`, `Bulk<Model>ActionRequest`; shared rules live in `app/Http/Requests/Concerns/*Trait.php` (`ValidatesListPerPageTrait`, `ValidatesSearchQueryTrait`). `authorize()` checks the permission (or the policy); `rules()` validates the whole payload at the trust boundary.
- A controller method receives the request, builds a `*Data` DTO from `validated()`, calls one `*Action` (write) or `*Service` (read), and returns an Inertia page, a redirect with a flash message, or a `*Resource`. Index pages paginate on the server (`?page`, `?per_page`, `?sort`, `?search`).
- Wayfinder generates the frontend route helpers (`@/routes/...`, `@/actions/App/Http/Controllers/...`): never hard-code a URL in TypeScript.

## Permissions and policies

- Permissions are a string-backed `app/Enums/PermissionEnum.php` (`CanShowUsers = 'can-show-users'`, `can-<verb>-<resource>`), roles a `RoleEnum` (`super-admin`, `admin`, …), stored with `spatie/laravel-permission`.
- `php artisan <app>:sync-permissions` creates the missing permissions from the enum, grants new ones to `admin`, clears the permission cache and writes `resources/js/enums/permission-enum.ts`. `<app>:install` and `<app>:upgrade` run it; never seed permissions by hand.
- Route groups are gated with the `permission:<value>` middleware; record-level decisions (ownership, state) live in `app/Policies/*Policy.php`, called through `Gate::authorize()` or `authorize()`. `Gate::before` grants `super-admin` everything.
- The UI receives `auth.permissions` as a shared Inertia prop and hides what the user cannot do (`useCan()`); the server check is the one that counts.

## API

Only when the spec asks for one: REST under `/api/v1`, `*Resource` responses, a hand-written OpenAPI file served at `/api/v1/openapi.json`, hashed API keys with scopes, named rate limiters. Details: https://github.com/qiick-io/app-ui/blob/develop/docs/api.md

## Security

- `SetSecurityHeadersMiddleware` on the `web` group (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), configured in `config/security.php`; HSTS belongs on the reverse proxy.
- Rate limiters for login, 2FA, passkeys and sensitive actions; `DB::prohibitDestructiveCommands(app()->isProduction())`; secrets stored encrypted (`encrypted` cast), never logged.
- Outbound URLs that users configure (OIDC issuers, webhooks) are SSRF-validated before the request.

## Logging and audit

- Every domain model a user can change uses `app/Traits/LogsApplicationActivityTrait.php` (`spatie/laravel-activitylog`: all attributes, only dirty, never empty), excluding secrets (`password`, `two_factor_*`, `remember_token`, key hashes).
- Log names: `default`, `auth`, `settings`, `ai`, plus one per domain area; `ip` and `user_agent` are added to every entry. The activity log is a page behind `can-show-activity-logs`.
- Application logs go to the stock `config/logging.php` channels (`stack` → `single` / `daily`, `stderr` in Docker). No personal data or secrets in log messages.

## Realtime

Broadcasting is optional: `BROADCAST_CONNECTION=null` must leave the app fully usable. Events are `app/Events/*Event.php` with `ShouldBroadcastNow` and a stable `broadcastAs()`; channels are `App.Models.User.{id}` (private), `online` (presence) and `<resource>.{id}` (presence when people collaborate), each authorised in `routes/channels.php` with `is_active` checked. Details: https://github.com/qiick-io/app-ui/blob/develop/docs/realtime.md

## AI

AI is off for writes by default: read-only tools only, write and destructive tools behind an env kill switch, an allowlist and a per-call approval; every tool call is logged; tests fake the agent. Details: https://github.com/qiick-io/app-ui/blob/develop/docs/ai-backend.md

## Operations

- `GET /health/live` (process up, no I/O) and `GET /health/ready` (database, cache and queue reachable, `503` otherwise), outside auth, from `routes/health.php`.
- Every Artisan command of the app is in the `<app>:` namespace (`<app>:install`, `<app>:upgrade`, `<app>:sync-permissions`, `<app>:create-user`).
