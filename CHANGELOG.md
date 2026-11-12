# Changelog

All notable changes to **Externa Core** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version source of truth: `composer.json` `version` (mirrored in `package.json`).

## [Unreleased]

### Added

- AI drafts in the item editor: an "AI draft" button turns a short brief into proposed values for the collection's text fields (structured output, checked against each field's rules; invalid values are left out and listed), previewed before they fill the unsaved form. Off by default (`AI_ITEM_DRAFTS`, `AI_ITEM_DRAFTS_MODEL`, `AI_ITEM_DRAFTS_MAX_TOKENS`); needs `can-use-ai`, the new `ai.draft` permission and create or update on the collection. Each draft is logged as an `ai_prompt` (surface `item_draft`, token usage, no content) and counts towards the daily prompt cap and token budget (#210).
- Opt-in structured logging: `LOG_CHANNEL=structured` (or `structured` in `LOG_STACK`) writes one JSON object per line to stderr with `request_id`, `user_id` / `api_key_id`, route, queued job class and attempt, environment and app version, and redacts authorization headers, cookies, tokens, passwords and secrets. Every response now carries an `X-Request-Id` header (a valid incoming id is kept, otherwise one is generated); the default `stack` output is unchanged (#209).
- Live Preview on the create form: the unsaved form state is validated, stripped by the field ACL and stashed for the preview token TTL (5 minutes) without creating an item; `GET /api/v1/preview` returns it like a draft item (`data.id` null, `meta.unsaved` true), and saving or leaving the form revokes the token (#368).

### Security

- AI tool approvals: two concurrent approve or reject clicks can no longer both decide (and run) the same call; the decision is one conditional update (#441).
- An approved MCP call runs under the API key that asked for it (new `pending_tool_calls.api_key_id`), so the key's role, `collection_slugs`, read-only and files scope still apply, and a key revoked or narrowed while the call waited cannot run it (#441).
- Rejecting a pending tool call needs the same tool permission as approving it; the requester can still withdraw their own call (#441).
- Public API cost budget: a batch create, update or delete is charged once per entry (`API_COST_MUTATION` × the number of `items` / `ids`), so a 100-item batch costs like 100 writes, not one (#441).
- Deploy hooks: the delivery is pinned to the address the SSRF guard resolved (`CURLOPT_RESOLVE`), so a DNS change between the check and the request cannot reach a private host; publish-triggered builds wait 30 s and queue one delivery per hook, so a scheduled publish of N items no longer queues N builds per hook (#441).
- MCP: `/mcp` accepts only an owned API key (Bearer). The session-user path is gone: `/mcp` is outside the `web` group and exempt from CSRF, so it was unreachable and would have been unsafe to wire. Failed authentications are limited per IP (`AI_MCP_AUTH_FAILURES_PER_MINUTE`, default 20) before the per-key `throttle:mcp` (#441).
- Collections: restoring a revision needs the collection Update grant (a Read grant was enough), and restoring a trashed item, alone or in bulk, needs the item inside the actor's write filter (#710).
- AI daily budget: an optional per-user daily token budget (`AI_DAILY_TOKEN_BUDGET`, default 0 = off) next to the prompt cap (`AI_DAILY_PROMPT_LIMIT`); both now also cover field translation, which is logged as an AI prompt (field keys only) with its token usage, and today's usage shows under the AI composer when a limit is set. The chat route uses a named `ai` limiter (`AI_RATE_LIMIT_PER_MINUTE`, default 30; `AI_RATE_LIMIT_PER_DAY`, default 0 = off) (#275).

### Changed

- qiick standards pack and `@qiick` registry pinned to app-ui v0.4.0 (core and optional UI patterns; none adopted yet); the `confirmation` and `reasoning` overrides are gone, as both files match the registry again (#666).
- `.env.example` now documents every Externa setting read by `config/` (first super-admin, CORS origins, security headers, activity log, Git export author, hosted AI provider keys, …), and CI checks that new `env()` keys are documented (`npm run lint:env`) (#291).
- The frontend toolchain is Vite+ (`vite-plus` 1.4.0): `vp dev` / `vp build`, Oxlint for lint (the same rules as before, including jsx-a11y and externa's own rules for hard-coded UI text and admin paths) and Oxfmt for formatting, replacing ESLint and Prettier (#609). The qiick ratcheted rules run in Oxlint (`npm run lint:standards`, new `qiick-lint-baseline.json`). Contributors: run `npm ci` after pulling; editors use the Oxc extension instead of the ESLint and Prettier ones.
- `spatie/laravel-permission` 8 (from 7.4). Its only breaking change is that the `Role` and `Permission` contracts accept a `BackedEnum` in `findByName()` / `findOrCreate()`; externa's `Role` model does not override them, and the migrations and config are unchanged (#667). Run `composer install` after pulling.
- Tests run on Pest 5 (PHPUnit 13), with the Laravel and browser plugins at 5. Contributors: `composer install` after pulling (#611).
- Inertia 3 (`inertiajs/inertia-laravel` 3, `@inertiajs/react` 3). `config/inertia.php` follows the v3 layout (page settings under `pages`); the root template marks the title with `data-inertia`. `php artisan externa:upgrade` already clears the compiled views the new `@inertia` output needs. If you customised `config/inertia.php` or `resources/views/app.blade.php`, re-apply your changes on the new files (#611).
- TypeScript 7 (the Go-native compiler); `npm run types:check` is about ten times faster. Contributors: `npm ci` after pulling (#611).

### Fixed

- Field forms, item table cells and field conditions no longer turn an object-valued setting or option into the text "[object Object]": non-scalar values fall back to the field's default (#671).
- Converting a field type on a large collection keeps only ids and values between the read and write phases, and writes chunk by chunk, instead of holding every item with its relations in memory (#441).
- The AI import status poll retries a failed check with backoff (4 s up to 30 s, five attempts) instead of stopping for good at the first network error (#441).
- The TypeScript SDK package builds itself on `npm pack` / `npm publish` (`prepack`) and declares its repository, so it can no longer be published without `dist/` (#441).
- Chat: deleting a message logs the chat's UUID as `chat_id` in the activity log instead of an integer cast of it (`0` or its leading digits) (#723).

## [1.4.0] - 2026-11-10

### Upgrade notes
- **Docker workers as www-data (#320):** existing bind-mounted `storage/` / `bootstrap/cache` volumes that were created as root may need a one-time `chown -R www-data:www-data storage bootstrap/cache` (or recreate the volume). The entrypoint still `chown`s when it starts as root.
- **Run `php artisan externa:upgrade`** (or `migrate` + `permissions:sync`). It now computes `files.effective_access` for existing files (no manual backfill), re-owns API keys created by deactivated users to the first active super-admin, and grants the built-in `admin` role the new `deploy.trigger` and `ai.prompts.manage` permissions (#434, #439).
- **AI write tools are denied by default** (#203): chat keeps the read actions of `Manage*` tools; writes need `AI_WRITE_TOOLS=true` plus the per-tool allowlist and human approval (#439).
- **Security headers are on by default** (#187): review `SECURITY_*` if you embed the admin in a frame or need a custom CSP.
- **PostgreSQL 15 or later** is required for the `collections_items_values` null-locale unique index (`NULLS NOT DISTINCT`, #278).
- **AI reasoning settings (#570):** the assistant asks real providers for medium reasoning effort. Tune or turn it off with `OPENAI_REASONING_EFFORT`, `ANTHROPIC_REASONING_EFFORT`, `GEMINI_REASONING_EFFORT` and `LOCAL_AI_REASONING_EFFORT` (unset = none). `AI_ASSISTANT_PROVIDER` picks the assistant's provider (default `local`) and `*_CONTEXT_WINDOW` sets the context size shown in the chat.
- **Removed packages (#520, #568):** `laravel/sail`, `@headlessui/react`, the unused Radix packages and the Wayfinder Vite plugin are gone; run `composer install` and `npm ci` after pulling.

### Security
- Symfony components updated to 8.1.11 for the 2026-11-04 advisories: HtmlSanitizer host-allowlist bypass (CVE-2026-118517) and `srcset` sanitising, Filesystem path-root handling, HttpFoundation, HttpKernel, Serializer, Routing and a YAML parse-time DoS. Composer and npm packages are refreshed within their ranges; dev tooling moves to Vitest 5 and jsdom 29 (#516).
- Secure-by-default install: registration off for fresh installs, IP throttle (5/min) on register/forgot/reset, passkeys limiter keyed on IP, Docker entrypoint refuses `change-me` DB passwords in production, safer `.env.example` (`APP_DEBUG=false`, webhook token guidance) (#272).
- Outbound webhooks send `X-Externa-Signature-V2` over `"{timestamp}.{body}"` (legacy `X-Externa-Signature` kept for one minor); inbound collection-import requires `X-AI-Webhook-Timestamp` within 300s, signs `"{timestamp}.{body}"`, and rejects replayed signatures (#273).
- Harden `SafeRemoteUrlValidator`: explicit CIDR denylist (CGNAT 100.64/10), DNS pin via `CURLOPT_RESOLVE`, DNS-pinned byte-capped downloads, generic user errors, OIDC discovery/endpoint SSRF checks (`OIDC_ALLOW_PRIVATE_HOSTS`) (#274).
- Run Horizon, Reverb, scheduler, Pulse and queue workers as `www-data` (via `setpriv`) instead of root in the production image entrypoint (#320).
- Bind API keys to an optional owner (`owner_id`) so effective access is key role ∩ scopes ∩ owner ACL; revoke keys when the owner is deactivated or deleted (#215).
- Add per-key `files_scope` (`none`|`read`|`all`) so scoped API keys can opt out of Files API access; migration defaults existing keys to `all`; response cache factors include the setting (#322).
- Add project Files upload allowlist (extensions/MIME) with SVG opt-in; hard floor still blocks executables/HTML/SSI even if listed (#327).
- Bump production npm deps for `follow-redirects` / `qs` audit findings (#341).
- **Files API:** on installs upgraded from 1.3.0, `GET /api/v1/files` no longer lists private files, or files in private folders, to roles without `read_private`; a file whose `effective_access` is not computed yet is hidden instead of treated as public (#434).
- **MCP authorization parity:** MCP resources and tools enforce the same collection, item, field and file permissions as the chat tools, plus the API key's `collection_slugs`, `files_scope` and `read_only`. `publish_item` and `tag_file` run through the AI tool executor (kill switch, allowlist, human approval) and the admin publish checks, so publishing no longer fires deploy hooks without approval (#435).
- **Security headers for the admin UI** (#187): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and a default `Content-Security-Policy` on web/Inertia responses (API, GraphQL and responses with their own CSP are skipped). Env keys: `SECURITY_HEADERS_ENABLED` (default `true`), `SECURITY_CSP`, `SECURITY_X_FRAME_OPTIONS` (default `DENY`), `SECURITY_REFERRER_POLICY` (default `strict-origin-when-cross-origin`), `SECURITY_PERMISSIONS_POLICY` (default `camera=(), microphone=(self), geolocation=(), payment=(), usb=()`).

### Added
- Optional first-party MCP server (`/mcp`, `laravel/mcp`): `AI_MCP_ENABLED` / `AI_MCP_WRITE_ENABLED`, owned API keys with `mcp:read`/`mcp:write` scopes, permission-aware tools/resources over the shared AI tool registry, dedicated `mcp` rate limiter; OAuth/Passport deferred (#121).
- Consistent admin empty states via shadcn `Empty` (`PageEmptyState`): icon, title, description, primary CTA, optional docs link; hide list chrome for no-records vs Clear filters for no-results (#234).
- Safe field type / translatable conversion for fields with existing content: documented conversion matrix (string↔textarea↔markdown, string→select, translatable flips), dry-run preview, chunked `externa:field-convert` artisan command, admin convert dialog, AI `convert_field` (approval-gated), activity log + `source=convert` revisions; historical revisions stay snapshots and restore adapts or rejects incompatible values (#220).
- Six built-in appearance theme presets (Teal default, Blue, Indigo, Violet, Rose, Slate) alongside optional custom brand hex, with AI-role override when the Violet preset or a violet-ish custom hex is selected (#243).
- Public CMS API batch item create/update/delete (`POST|PATCH|DELETE /api/v1/collections/{slug}/items/batch`) with `API_MAX_BATCH_SIZE` (default 100), atomic-per-item results, shared #269 write Actions, per-item activity log and existing `item.*` webhooks (no batch event types) (#125).
- Public REST/GraphQL system-column filters on items (`filter[id]`, `filter[created_at]`, `filter[updated_at]`, `filter[published_at]`) with typed operators and ISO-8601 datetime validation (#333).
- Public REST/GraphQL depth-1 relational filters (`filter[author.name][_eq]=…`); hard cap on join depth (422 above), related-collection readability gate (same as `?include=`), OpenAPI notes, and `API_COST_FILTER_RELATION` cost-budget interaction (#124).
- AppAssistant Agent Skills (`HasSkills` + `resources/skills/{collection-operations,collection-import,approvals}/SKILL.md`) loaded on demand via `LoadSkill` for CMS/operator playbooks; playbook texts are drafts for maintainer review (#181).
- File manager Flysystem disks for Google Cloud Storage (`FILES_DISK=gcs`) and Azure Blob (`FILES_DISK=azure`) via `spatie/laravel-google-cloud-storage` and `azure-oss/storage-blob-laravel`, with env keys, README notes, and Pest smoke coverage (#188).
- AppAssistant conversation context attachments: permission-filtered item/file picker, project-level saved prompts CRUD (`ai.prompts.manage`), and send-time AuthZ re-check so revoked access cannot leak into the model prompt (#195).
- Live Preview optional `as_of` token claim (max 90 days ahead): point-in-time overlay of scheduled `publish_at` drafts / hide after `unpublish_at`, admin “Preview at…” picker, and `GET /api/v1/preview` meta (`as_of`, `source`) (#222).
- Project deploy hooks (Vercel / Netlify / Cloudflare Pages / Forge): encrypted named URLs, `deploy.trigger` permission, admin Deploy button, optional deploy-on-publish, activity log, and last-run status (#196).
- Admin a11y phase 3: overlay focus restore (Sheet/Drawer/Dialog + file detail panel), Inertia `#main-content` focus after navigation, polite/assertive live announcements (toasts, notifications, AI final answer, empty-table status), targeted reduced-motion rules that keep Radix/vaul overlays unmounting, and scroll-padding for sticky toolbar/FAB (#254).
- Admin a11y phase 4 automation: `eslint-plugin-jsx-a11y` (errors on shared React, warnings on pages), Pest Browser axe smoke on key routes (required `browser` gate on code PRs), `npm run a11y:contrast` theme-token CI check, screen reader checklist, and third-party limits doc (#255).
- Server-side i18n: `lang/it.json` / `lang/de.json` for `__()` flash and validation strings, with Pest key parity coverage (#282).
- Prompt-injection and denied-permission Pest suite for chat + MCP (`tests/Feature/Ai/Security/*`) with scripted compromised-LLM driver, ≥20 payloads × roles × surfaces, audit/approval assertions, and SECURITY checklist link (#204).
- Human approval + audit log for AI tool calls: write/destructive tools denied by default (`AI_WRITE_TOOLS` kill switch + per-tool allowlist), chat `Approvable` for write actions, MCP `PendingToolCall` admin inbox (15m TTL), redacted `ai_tool` audit trail with retention prune (`ai:prune-tool-audit`) (#203).
- Shared permission-aware AI tool registry (`AiToolRegistryService` / `AiToolExecutorService`) with chat + MCP adapters, config gates (`ai.tools.*`), and AuthZ parity tests (#202).
- Admin a11y phase 2 controls: `html lang` sync on locale change, content-locale `lang` + flag text alternatives, native field-row button, required-field text marker, and expanded `a11y.*` icon-only labels (en/de/it) (#253).
- Admin a11y phase 2 foundations: `Icon` decorative-by-default semantics, translated dialog/sheet Close + sidebar toggle, unread/notifications names, and new `a11y.*` keys with locale parity coverage (#253).
- Add `@qiick/externa-sdk` TypeScript Public CMS client under `packages/sdk` (OpenAPI-generated types + CI freshness check); initial package version `0.1.0` (#119).
- Public CMS `sort` query param (REST CSV / GraphQL `[String!]`, max 3 keys, `-` = desc) for system `id`/`created_at`/`updated_at`/`published_at` and sortable fields; expose `published_at` on item payloads; indexes on `(collection_id, published_at|created_at|updated_at)` (#224).
- Add Vitest frontend unit runner and CI step for `resources/js` lib/hook tests (#285).
- Add Pest coverage for GraphQL write AuthZ, chat ownership routes, cleanup commands, and embedding job (#286).
- AI tool actions `ManageCollectionItems` `publish` and `ManageFiles` `tag` (write actions, approval required) (#435).
- File manager "Empty trash": a queued job permanently deletes every trashed file and folder and notifies the requester when done (`DELETE /files/trash`, `can-force-delete-files`) (#497).
- Files selection bar select-all (loaded files), Assistant conversation search by title (`GET /ai/conversations?q=`), and a rows-per-page select on admin lists (10 / 20 / 50 / 100, kept in `per_page`) (#480, #492, #505).
- The AI assistant opens as a side panel on the current page from the sidebar Assistant hover action or ⌘J / Ctrl+J; the floating button is removed and the panel links to the full page (#499, #503).
- Blue theme preset (Excubia's brand blue) (#508).
- AI answers show the model's reasoning (collapsed, "Thought for N s"), every tool call with its input, result or error, the sources it cited and the tokens used, live while streaming and again after a reload (#565, #566, #570, #572).
- Chat: a user card on author names and mentions (avatar, role, online status), reactions with a tooltip of who reacted, and pinned messages and reply quotes as clickable rows (#575, #576).
- Admin lists (users, groups, roles, API keys, permissions, activity log, jobs, pending tool calls) are server-driven data tables with sortable columns, faceted filters and row actions (#523, #526–#528, #530, #533, #535, #537, #561).
- Deleting a chat, a saved prompt or a message asks for confirmation (#522).

### Changed
- Shared UI helpers: `lib/http` (`parseError`/`assertOk`/`requestJson`), `lib/format` (bytes/initials/datetime-local), `useDebouncedServerSearch`; admin pages use Wayfinder instead of `lib/admin-routes`; shared `FieldDef`/`ItemRow`/`EchoInstance` types; re-enable `no-explicit-any` and lint against hard-coded admin paths (#284).
- Self-host Geist / Geist Mono via `@fontsource-variable/*` (Vite-bundled); drop Instrument Sans and `fonts.bunny.net` from the admin shell; apply `font-mono` to obvious slugs, IDs, API paths, and versions (#228).
- Replace hand-styled native `<select>` with shadcn `NativeSelect` (activity-log filters, role form, item filters, field settings, layout editor, blocks/m2a, chat drawer) (#232).
- Sidebar brand active state uses teal `--sidebar-accent*` tokens with de-emphasized inactive items (`ink-600`), a 3px teal left bar on `data-[active=true]`, and settings secondary nav aligned to `SidebarMenu` / `SidebarGroupLabel` styling (#238).
- Lucide-only icon cleanup: replace hand-drawn multi-select chevron with `ChevronsUpDown`, switch the icon picker to `lucide-react/dynamic` (`DynamicIcon`, no full `icons` map), upgrade `lucide-react` to ^1.61, and replace `react-file-icon` with Lucide `File*` glyphs on a muted tile (#241).
- Unified violet `ai` theme tokens (`--ai` / `--ai-hover` / `--ai-foreground` / `--ai-bg` / `--ai-text` / `--ai-border`) for all AI surfaces; Button/Badge `ai` variants; replace orange/rose/amber AI accents on sidebar Assistant, FAB, translate beam, and Sparkles icons (#242).
- Admin table conventions: muted uppercase `TableHead`, shadcn `Pagination` for Laravel link rows, `TablePanel` without extra border, combined name+slug cells, `tabular-nums` on numeric columns, and remaining raw tables migrated to `Table*` (#236).
- Item-edit form column capped at `max-w-3xl`; short inputs (number, color, date, slug) default to half-width / content-sized controls; section titles use small muted semibold; published readonly fields use a distinct muted style (not 50% opacity); API key creation opens in a Dialog from the header primary button (#237).
- Replace hand-rolled appearance tabs, color+hex fields, sidebar unread pills, and password strength bar with shadcn `ToggleGroup`, `InputGroup`, `SidebarMenuBadge`/`Badge`, and `Progress`; drop `@headlessui/react` Transition in favour of `tw-animate-css`; auth split panel uses `bg-ink-950`; delete unused starter `welcome.tsx` (#239).
- Replace arbitrary sub-12px / rem font sizes with `text-xs` (and scale tokens) in page code; tighten off-scale spacing toward 2/3/4/6/8/12; add `scripts/check-ui-tokens.mjs` guardrail for arbitrary `text-[…]`, raw palette classes, and `#hex` in `className` outside `components/ui` (#240).
- Wrap remaining `withMessages` / `abort` user-facing literals in `__()`; AI/admin UI `t()` coverage, locale-aware dates/numbers, speech + `document.documentElement.lang` follow app locale (#282).
- Boolean ("Toggle") item fields and appearance sidebar module toggles use shadcn `Switch`; `radio_group` item fields use shadcn `RadioGroup` instead of native radios (#233).
- Destructive and unsaved-changes confirms use shadcn `AlertDialog` (overlay `--overlay` token); irreversible collection force-delete requires typing the collection name (#230).
- Collection create/edit drawer, field settings form, and dynamic item fields use shadcn `Field*` / `FieldError` with `aria-invalid` / `aria-describedby` (#231).
- Admin users/groups drawers, API keys, and roles form use shadcn `Field*` with `aria-invalid` / `aria-describedby`; role permission groups use `FieldSet` (#231).
- Remaining settings forms (appearance, project tabs, delete-user, two-factor setup) use shadcn `Field*` with `aria-invalid` / `aria-describedby` (#231).
- Bump `laravel/mcp` to `^1.1.2` (GHSA-m25c-38v7-94p8), `laravel/boost` to 2.10.4, `laravel/framework` to 13.39.0, and `laravel/wayfinder` to 0.1.23 (#375).
- Calm destructive row/bulk actions (outline/ghost), shared collections/items row menu pattern, and button size scale (`sm`/`default`/`lg`/`icon`/`icon-sm`) (#229).
- Settings profile and security password forms use shadcn `Field*` with `aria-invalid` / `aria-describedby` (#231).
- Admin a11y foundations: CONTRIBUTING rules, contrast pair table, zoom-safe viewport guard, skip/`main` on auth card+split layouts, light `--ring` teal-500 for 3:1 (#252).
- Admin a11y landmarks polish: real `<nav aria-label>` in sidebar (desktop + mobile Sheet) and header variant, labelled file-detail/chat asides, translated breadcrumb + item-chat drawer names (#252).
- Auth forms use shadcn `Field` / `FieldLabel` / `FieldError` with `aria-invalid` + `aria-describedby` and `noValidate` (#231).
- Semantic status Badge/Alert variants (`success`/`warning`/`info`/`muted`) and replace hardcoded green/emerald/amber/red status surfaces with theme tokens (#235).
- Faster PR → `develop` CI: path-aware stubs for required checks; Pest PHP 8.4-only + Vitest on code PRs; full matrix + browser on push/`main`/nightly (#381).
- Scale chat hub and file transforms: shared `FileTransformUrlBuilder`, SQL-scoped/paginated hub listing with eager item labels, queued chat notifications with JSON-contains subscriber lookup, bulk `collections_items_values` inserts (#280).
- Extract shared `MiniUserMapper` for Public API `user_created` / `user_updated` payloads (#338).
- Move job-monitor and AI conversation DB access out of controllers into `JobMonitorQueryService` / `AiConversationMutationService` (#334).
- Rename legacy `App\Services` classes to `*Service` suffix; empty Arch Services ignore list (#336).
- Stream SHA-256 hashing for file uploads and chunk finalize (`hash_file` / `hash_update`) so large files are not loaded into a PHP string for hashing (#189).
- Denormalize `files.effective_access` (with backfill command) so file list AuthZ no longer loads the full tree (#186).
- Route web, REST, GraphQL, AI, import, chat, revision restore, and publish through shared `CreateCollectionItemAction` / `UpdateCollectionItemAction` so validation and draft versioning stay in parity (#269).
- Bump `laravel/ai` constraint to `^1.1` (resolved v1.3.0) (#180).
- Harden CI: parallel Pest, shared Vite artifact, caches, concurrency/timeouts, SHA-pinned actions, Dependabot, hard browser gate (#289).
- `check-ui-tokens` fails on stale baseline entries, so allowances for fixed raw palette and hex usage cannot hide a later regression (#452).
- New `--primary-hover` token for primary button and link-badge hover (AA in light and dark) (#449).
- Theme presets now only define brand colours over one shared base in `config/theme-presets.php`; the appearance preview reads them from the server (no client copy); the dark shell is two-tone again (sidebar `ink-900` over `ink-950` content) and the `app.css` fallbacks match the default preset (#506–#509).
- Admin layout pass: framed content panel with flat tables (lists, dashboard cards, chat and assistant hubs), sticky table headers, a three-area list footer (range, pages, rows per page), dashboard tabs as a header segmented control, and the chat and assistant pages on one shared layout with one composer (#484–#487, #493–#505).
- Controls follow one size scale (24 / 32 / 40) and one field focus style; selection bars show count and select-all on the left and icon actions on the right; activity log date filters use one range picker; settings group the AI pages under "AI" (#462, #472, #489–#492, #508).
- Sidebar and settings nav: full-height active bar with square left corners and a theme-primary Assistant item; groups list shows an initials avatar and member avatars; activity log filters use one responsive grid with the export menu in the header (#463, #466, #473, #478, #479, #481).
- The files grid loads more files automatically while scrolling, 48 per page; the Load more button stays as a fallback (#514).
- The admin UI is rebuilt on standard shadcn/ui and AI Elements: pickers and autocompletes on Command, lists on Item, forms on Field, toggles on Toggle, loaders on Spinner/Skeleton/Empty, chats on Message, Bubble, Message Scroller and Attachment; nine primitives re-pulled from current shadcn (#517–#580).
- Success messages appear as a short message at the top centre; errors, warnings and info as top-right notifications; form validation errors show under their fields (#519).
- Avatars: per-user colours on the shadcn avatar, presence as a badge at the bottom right everywhere (green online, grey offline, red only when the realtime connection is lost), groups show three members and +N (#545, #560).
- Dashboard views are routed tabs with stat cards and chart containers (#517, #542).
- File and folder cards are square: the preview fills the card edge to edge on the image's focal point, with one row below for the name, a tags hover card and a ⋮ menu with the same actions as right-click; the grid shows two columns on phones and cards of at least 15rem elsewhere. The details panel sets an image's focal point by clicking its preview (arrow keys nudge it); the unused Translate X / Translate Y / Scale fields are gone from the panel (#583, #584, #592, #596).
- Every admin table uses one 41px row height with small avatars and row actions, and sortable column headers match the plain ones (#585, #586).
- Every remaining hard-coded admin string is translated (en/it/de), and colours come only from theme tokens: folders and favourites use their own amber tokens, and the light-mode success, warning and info colours are one step darker so status badges meet WCAG AA (#593, #595).
- Contributor rules come from the qiick standards pack (agent files, architecture tests, strict Eloquent models outside production, knip, and ratchets for Larastan, untranslated strings and raw colours), checked in CI together with the app-ui registry drift check (#588, #594).
- The AI assistant and chat pages render through the shared @qiick registry components (chat layout, answer parts, mentions), and hand-built controls (emoji grid, icon picker, pagination, conversation rows, markdown tables, empty and loading states, native tooltips) use the standard shadcn components (#603, #606, #607).
- Assistant answers show each tool call as one line with a sentence ("List collections", "Searched the web") and the record it works on, never its JSON; several calls fold into "Done in N steps", and reasoning and sources are lines of the same trace (#615).
- The assistant's reasoning opens while the model thinks and closes to "Thought for N seconds" when it finishes; once you open or close it, your choice stays (#621).
- A write the assistant wants to make waits on one approval card with the call in words: Approve takes the brand colour for a write and turns red only when the call deletes data, and no follow-up suggestions show until you decide (#619).

### Fixed
- AI import-job polling cancels on unmount/new job and pauses while the tab is hidden; theme prefers-color-scheme listener binds once and can be torn down (#284).
- Axe smoke: Playwright `inDarkMode`/`inLightMode` first paint + sync `color-scheme` with `.dark` (CSS + boot script); underline uses `decoration-muted-foreground`; dashboard overflow panels are named `region` landmarks with `tabIndex={0}` (scrollable-region-focusable) (#255).
- Dark primary button AA: `.dark` `--primary-foreground` uses dark brand fg / ink-950 (not light `#fff`); placeholder opacity 1; darker dark `--muted-foreground` (ink-200) for axe smoke (#255).
- Visible focus ring (offset, full-opacity `--ring` teal-600/teal-400) and 3:1 `--input` (ink-400/500) borders on shadcn UI controls, item-form chrome, and password affordances (WCAG 1.4.11 / 2.4.7) (#227).
- Wrap chat message create, direct-chat create, bulk item actions, kanban rank shifts, and AI collection duplicate in transactions/`lockForUpdate`; authorize bulk items before mutate; report (not 500) broadcast failures after a saved write; Postgres `collections_items_values` unique uses `NULLS NOT DISTINCT` with dedupe (#278).
- Stabilize Browser Pest suite waits/selectors and clear ProjectSettings memo between tests (#345).
- Add job timeouts/retries/`failed()` notifications and `report()` on soft-fail catches; make embedding job unique (#279).
- Make scheduled publish atomic (`lockForUpdate` + transaction) and prevent schedule command overlap (#270).
- Fix flaky `ImportRemoteJsonTest` on PostgreSQL by selecting the imported item by slug (#331).
- Security headers allow AI chat voice input (`microphone=(self)`) and image/video previews from the configured files disk (S3 / GCS / Azure / CDN origin in `media-src` and `img-src`); in local dev the Vite origin, including Herd HTTPS, is read from `public/hot` (#440).
- AI chat: `Manage*` tools are available again for their read actions while AI write tools are off (#439).
- API keys: the `owner_id` backfill no longer assigns a key to a deactivated creator, so existing keys keep working after the upgrade (#439).
- Relational API filters (`filter[relation.field]`) work on PostgreSQL and MySQL/MariaDB: many-to-one no longer fails with `text = bigint`; many-to-many and one-to-many match the exact related id and check every linked item (#436).
- Appearance settings: the theme preset picker and live preview are back, saving keeps the selected preset, a custom brand colour is stored only when set, and the preview keeps the dark palette in dark mode (#437).
- Focus ring and focused input border stay at least 3:1 when the custom brand colour has low contrast; otherwise the teal ring is used (#453).
- Restored work that stale squash merges had reverted (#449, #452, #457): sidebar `<nav aria-label>` landmark and violet AI accent on the Assistant item; shared empty states (collections, users, API keys, roles, items, file grid); collections table name/slug cell; settings save bar status announcements; full-opacity focus ring on colour fields; appearance `ToggleGroup` and `ink-950` auth panel; Assistant context picker; item form field sizing and read-only style; translated a11y labels; `lucide-react` ^1.61 without `react-file-icon`; `is/has/can` boolean method names (guarded by an Arch test).
- Collection row menu: "Delete" opens the confirm dialog instead of navigating into the collection (#438).
- CI: the full browser suite completes (no silent 20-minute hang), a failing `assets` job fails the required checks, and `resources/skills/**` changes run the full gate (#438).
- Select menus flip upward near the window edge and drop the dark tinted trigger background; file thumbnails that fail to load fall back to the type icon; user menu labels, the deploy-on-publish switch and AI tools checkboxes are aligned (#482, #483, #495, #496, #508).
- Files multi-select keeps every ticked file; Ask AI entry points are disabled while AI is offline, with provider-neutral copy; the item edit sub-header stays steady; the collections list shows name, slug and description columns again (#464, #465, #476, #477, #488).
- `externa:upgrade` also clears the cached GraphQL schema (`lighthouse:clear-cache`), so the new GraphQL sort and filter arguments work right after an in-place upgrade (#510).
- Items can be created from the admin on collections with versioning enabled; the create form was read-only with no Save button (#512).
- GraphQL `item`, `createItem` and `updateItem` return `created_at` / `updated_at` instead of a DateTime error (#511).
- The files grid scrolls on short windows instead of clipping the last rows, and uploading, moving or deleting files keeps the loaded files instead of resetting to the first page (#514).
- Form field controls fill their field width (#555); item form tabs keep every field mounted, so switching tabs no longer loses input (#540).
- The 404 page gets the app props and renders inside the app shell; the error boundary uses the shared empty state (#544).
- The selected file's outline is no longer cut by the files grid (#574).
- Chat photos fill their bubble and the caption wraps inside it; reactions under the last message are no longer cut off (#582).
- The user and group pickers have an accessible name (#586).
- The dashboard's storage-per-disk card no longer fails with a server error (#589).
- On a phone the chat shows either the conversation list or the open thread, not both squeezed side by side (#590).
- Accessibility sweep fixes: sidebar label contrast, 24px checkbox targets, matching accessible names on collection rows and date-range pickers, focusable scroll regions; list filters wrap on phones and input groups are transparent in dark mode (#591).
- Breadcrumbs, page titles, placeholders, confirm buttons, item filter operators and other labels are translated in Italian and German; a lint rule now catches untranslated UI props (#602, #605).
- Recomputing file access no longer queries each file one by one (#604).
- The Chat hub's Private tab no longer fails when you have two or more direct chats (#623).
- The Chat hub's Collection badge counts only chats of collections you can read, so it never shows a number over an empty list (#625).

## [1.3.0] - 2026-10-24

### Security

- Public API key scopes (`collection_slugs`, `read_only`) are enforced in `CollectionPermissionEnforcer` (including relation `?include=` hydration) and partition REST/GraphQL response cache keys so scoped keys cannot reuse a wider key’s cached payload; `read_only` also blocks Files API writes via the shared `ApiKey::allowsAction()` gate
- Raise `laravel/framework` Composer floor to `^13.29` (GHSA-f9x3-7vq9-cph6; lock already on 13.33.x) (#217)
- Bump `livewire/livewire` 4.4.5 → 4.4.8 (GHSA-mhf7-xp6r-6qrc, via `laravel/pulse`), dev-only `zod` 4.6.7 and `fast-uri` 3.1.9; resync `composer.lock` content-hash (#276)
- SSRF guard on outbound webhook / Slack notifier URLs (save + delivery, no redirects); opt-in `WEBHOOKS_ALLOW_PRIVATE_HOSTS` (default false). Upload MIME allowlist + magic-byte checks via `MimeTypeValidator` on file manager, chunked upload, Public API, chat, and AI attachments (#118)
- Optional Public API cost budget (`API_COST_LIMIT`, default off), GraphQL depth/complexity env caps (`GRAPHQL_MAX_DEPTH` / `GRAPHQL_MAX_COMPLEXITY`, default off), and payload caps (`API_MAX_BODY_BYTES`, `API_MAX_PER_PAGE`) stacked with existing `throttle:api` + per-key limits (#113)
- `php artisan ai:rotate-webhook-token` with optional grace window (`AI_WEBHOOK_TOKEN_PREVIOUS` / `AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT`); collection-import webhook HMAC fails closed when no token is configured (no local unsigned bypass) (#207)
- Only super-admins can grant the super-admin role/groups or edit, delete and restore super-admin users and groups (web, bulk and AI tools) (GHSA-j87m-4qvv-5qgg)
- Admin collection item actions require a matching per-collection grant when the actor already has any collection permission grants; Spatie-only admins unchanged (GHSA-j7vc-w5wj-mx3x)
- Deny SSI/markup upload extensions (`.shtml`, `.shtm`, `.xml`, `.xhtml`, `.xht`, `.mht`, `.xsl`, `.svgz`); sandbox CSP on Docker nginx `/storage/` (GHSA-2mwj-jgfg-c694)

### Fixed

- Scheduled publish failures (approval invalidated after schedule, promote errors) persist on the item, notify editors/approvers, emit `item.publish_failed`, and warn when editing an approved scheduled draft resets approval (#221)
- Public API `PATCH /items/{id}` and GraphQL `updateItem` keep omitted fields and locales instead of wiping them; item value sync is now atomic (#268)
- `TRUSTED_PROXIES` is now applied (`config/trustedproxy.php`): client IP, HTTPS detection, rate limits and API key IP allowlists work behind a reverse proxy (#271)
- Reject `type` / `translatable` changes on fields that already have stored values (admin + AI); lock Translatable checkbox in the field form (#219)

### Added
- Community profile: Code of Conduct, PR template, and feature-request issue form (#332).

- Optional API key scopes: collection slug allowlist + `read_only` (effective access = role ACL ∩ key scopes; null/empty scopes keep legacy behaviour) for REST + GraphQL; admin create form fields (#116)
- Table-driven AuthZ regression Pest datasets for collection CRUD × actors, published/draft item filters, file public/private/inherited access, `include=files`, GraphQL read, and `EffectivePermissionResolver` / `FilePermissionGuard` matrices (#114)

### Changed

- Split project settings into dedicated sections (General, Localization, Authentication & Security, Content, Files & Media, API, Integrations, Sidebar) with per-section routes and saves; CORS cache cleared only on API save (#201)
- Weekly scheduled + manual `workflow_dispatch` runs for dependency audits (`audit.yml`); document thresholds in `SECURITY.md` (#184)
- Codice Perfetto naming: custom Enums/Events/Traits use explicit role suffixes (`*Enum`, `*Event`, `*Trait`); Pest `NamingArchitectureTest` + streamlined `.cursor/` rules pack; `AGENTS.md` / `CLAUDE.md` documentation standard (#260)
- Externa mark v3 (bow-tie) assets and admin colour defaults: primary `#0E7C86` (light) / `#1A95A2` (dark), focus rings and chart accents from the v3 teal scale; favicon links cache-busted with `?v=3` (#258)
- Public REST item lists batch-prewarm `?include=` relation targets once per response (`RelationIncludeHydrator::prewarm`) so depth-1 query count stays flat as parent N grows (#112)
- Memoize `ProjectSettings::raw()` for the request (singleton binding) so admin/Public item lists stop re-querying the `settings` table once per parent row (#117)
- Audit raw SQL call sites (`whereRaw` / `selectRaw` / `DB::select` / …); inline `// raw-sql: reviewed` markers; PHPStan disallow via `spaze/phpstan-disallowed-calls` with a reviewed-file allowlist (#208)
- Public API response cache: env `PUBLIC_API_CACHE_TTL` (default 120), per-epoch hit/miss counters, last-flush actor/time on Performance settings (#115)

### Upgrade notes

- **Breaking (`AI_WEBHOOK_TOKEN` required):** `POST /ai/webhooks/collection-import` fails closed when no token is configured (including local — the previous unsigned local bypass is gone). Set a non-empty `AI_WEBHOOK_TOKEN` in every environment that receives collection-import webhooks before upgrading. Rotate with `php artisan ai:rotate-webhook-token --grace=24h [--write-env] [--show]`; optional grace uses `AI_WEBHOOK_TOKEN_PREVIOUS` + `AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT`. After `.env` changes: `php artisan config:clear` (or rebuild config cache) and restart workers/containers (#207 / #297).
- **Breaking (webhooks / Slack SSRF):** outbound webhook and Slack notifier URLs that resolve to loopback, RFC1918, link-local, or other reserved hosts are **rejected on save and again at delivery** when `WEBHOOKS_ALLOW_PRIVATE_HOSTS` is `false` (the default). Delivery also refuses HTTP redirects. Self-hosted LAN targets (e.g. n8n on a private IP) must set `WEBHOOKS_ALLOW_PRIVATE_HOSTS=true` in `.env` and clear config cache (`php artisan config:clear` / `config:cache`). Public HTTPS receivers need no change (#118 / #267).
- **Breaking (uploads):** after the extension denylist, uploads must sniff to a MIME in `config/files.php` `upload_allowed_mimes`, with magic-byte checks for claimed formats. **SVG, JSON, XML, and `.shtml` are not on the allowlist** (and SVG/HTML remain extension-denied). Operators who previously stored those types via File Manager / Public API / chat→Files / AI attachments need an alternate pipeline or an allowlist extension in `config/files.php` (#118 / #267).
- **New optional env vars (defaults keep prior behaviour when unset):** `API_COST_LIMIT`, `GRAPHQL_MAX_DEPTH`, `GRAPHQL_MAX_COMPLEXITY`, `API_MAX_BODY_BYTES`, `API_MAX_PER_PAGE`, `PUBLIC_API_CACHE_TTL` (default `120`), `TRUSTED_PROXIES`, `WEBHOOKS_ALLOW_PRIVATE_HOSTS` (default `false`), `AI_WEBHOOK_TOKEN_PREVIOUS`, `AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT` (#113 / #115 / #118 / #207 / #271).
- **Behaviour (project settings routes):** `/settings/project` is split into dedicated sections with their own `GET`/`PUT` routes (General, Localization, Authentication & Security, Content, Files & Media, API, Integrations, plus Appearance sidebar). Setting **keys and stored values are unchanged**; permission remains `CanManageProjectSettings`. Update bookmarks, runbooks, and any automation that POSTed the old monolithic form to the matching section endpoints. CORS public-origins cache is cleared **only** on the API section save (#201 / #304).
- **Behaviour (authz — super-admin grants):** only existing super-admins may grant the super-admin role/groups or create/update/delete/restore super-admin users and groups (admin web, bulk actions, and AI tools). Delegated user/group managers without super-admin can no longer escalate or manage those principals (#307).
- **Behaviour (authz — collection grants):** when an admin already has any `collection_permissions` rows, item actions require a matching per-collection grant (fail closed). Spatie-only admins with no collection grants keep prior behaviour. Collection index hides collections without Read (#312).
- **Upgrade steps (source):** merge or check out the `v1.3.0` tag → `composer install` → `npm ci` && `npm run build` → `php artisan migrate` → set `AI_WEBHOOK_TOKEN` (and any optional caps above) → `php artisan optimize:clear` → restart queue/scheduler/Horizon. **Docker:** pull `ghcr.io/qiick-io/externa-core:1.3.0` (or `latest`); confirm `.dockerignore` excludes `/backups`, `/storage/app/*`, agent tooling dirs, and compose bake files so `docker build` does not ship local data (#294).

## [1.2.3] - 2026-10-22

### Security

- Security hardening of user-uploaded content responses (item chat attachments and Public API file content) and of Live Preview access control. See the security advisories [GHSA-wrg8-3xp4-qq8h](https://github.com/qiick-io/externa-core/security/advisories/GHSA-wrg8-3xp4-qq8h), [GHSA-6v82-w58h-mhqq](https://github.com/qiick-io/externa-core/security/advisories/GHSA-6v82-w58h-mhqq) and [GHSA-946v-wjmm-rvc2](https://github.com/qiick-io/externa-core/security/advisories/GHSA-946v-wjmm-rvc2). All users should upgrade.

### Changed

- Chat attachments: default maximum upload size is now **25 MiB** (`chat_max_upload_bytes`; previously unlimited). Raise it in Project settings if you need larger files.
- Chat attachments and Public API file content are now served as downloads (`Content-Disposition: attachment`) unless the file is a JPEG, PNG, GIF or WebP image, which still displays inline. Responses carry stricter security headers.
- Item-form chat attachments (upload and show) now require the `can-show-chat` permission and the Chat sidebar module to be enabled, in addition to `can-show-collections`.
- Live Preview links are bound to the user who generated them and are valid for **5 minutes** (was 15).

### Upgrade notes

- Source installs: merge or check out the `v1.2.3` tag, then run `composer install` and `php artisan optimize:clear`. Docker: pull `ghcr.io/qiick-io/externa-core:1.2.3` (or `latest`).
- Live Preview links generated before the upgrade stop working (403); reopen the preview from the item form to get a new link. Headless starters that cache preview URLs should request a fresh one.
- Users who attach files from the item form but lack `can-show-chat` need that permission, with the Chat module enabled, to keep doing so.
- Existing non-image files are now served as downloads; their links keep working but they no longer open in the browser tab.

## [1.2.2] - 2026-10-22

### Fixed

- `externa:install`: preserve or generate `APP_KEY` after rewriting `.env`, apply the selected stack to runtime config before migrate (minimal profile no longer needs Redis), and retry SQLite migrate after a clean reset when `--force` hits a half-applied DB (#245, #249)

### Security

- Official Docker image: pin base to `php:8.4.27-fpm-bookworm` and harden `docker/php/php.ini` (`session.upload_progress.enabled=0`, `session.use_strict_mode=1`, body/multipart limits matching nginx 100M) for CVE-2026-109618 / CVE-2026-109619 (#216). Composer `php` constraint raised to `^8.4.27` (#248). See the [security notice](https://github.com/qiick-io/externa-core/discussions/247).
- AI collection-import webhook (`POST /ai/webhooks/collection-import`): HMAC-SHA256 over the raw body compared only with `hash_equals`; mismatch and missing `AI_WEBHOOK_TOKEN` outside `local` return 401 (fail closed); secret is never logged (#185, #214)
  - **Upgrade:** callers must sign the raw request body only (`sha256=` + HMAC-SHA256). The previous body + newline + `collection_id` payload from #86 is no longer accepted. Invalid signatures now return **401** (was 403).

### Upgrade notes

- Docker: pull `ghcr.io/qiick-io/externa-core:1.2.2` (or `latest`) — built on PHP 8.4.27 with the hardened `php.ini`. Source installs: run PHP 8.4.27+ (or 8.5.12+) and disable `session.upload_progress` on your own runtime.
- AI collection-import webhook signers must switch to HMAC over the raw body and set `AI_WEBHOOK_TOKEN` in every non-local environment (see Security above).

## [1.2.1] - 2026-10-21

### Fixed

- Renaming a field no longer drops its value from pending drafts and older revisions (#218)

### Security

- `package-lock.json` bump: `follow-redirects` 1.16.0 → 1.16.1 ([GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c)); `vite` 8.3.0 → 8.3.5 (`package.json` range `^8.3.5`; via `launch-editor`: [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)); `brace-expansion` 1.1.18 → 1.1.21 (dev/eslint path) so `npm audit --audit-level=high` reports 0 high/critical

### Upgrade notes

- **Right after deploying 1.2.1**, and **before** the scheduler runs or anyone publishes, repair drafts/revisions that still hold a pre-rename field key (from renames before this fix):
  1. Recommended dry-run first (default, no writes): `php artisan externa:repair-renamed-field-drafts`
  2. Then apply: `php artisan externa:repair-renamed-field-drafts --apply`
  - Mappings come from CollectionField activity-log rename history; pass `--map=collection:old=new` (slug or id; repeatable) for orphans with no history. Never overwrites a value already under the new key. Publish-time behavior is unchanged.
  - Keys reported as **unmappable** belong to deleted fields and can be ignored.

## [1.2.0] - 2026-10-18

### Added

- Official headless starter conventions: multi-repo preferred, naming/env/TS/CI/Dependabot checklist in `docs/starters.md` (#156)
- Official Nuxt headless starter: [qiick-io/externa-nuxt-starter](https://github.com/qiick-io/externa-nuxt-starter) + docs [Headless starter](https://docs.externa.qiick.io/docs/headless-starter) (#152)
- Editorial approvals for versioned collections: `approvals_required`, submit/approve/reject, promote gate, review list filter, webhook events `item.submitted`/`item.approved`/`item.rejected`, Spatie `can-submit-collections` / `can-approve-collections` (#48)
- Translation helpers on the item form: locale switcher with per-locale completeness (filled/total), "Apply to all locales" / "Apply to empty locales", and per-field "Copy from {locale}" (#49)
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

[Unreleased]: https://github.com/qiick-io/externa-core/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/qiick-io/externa-core/releases/tag/v1.4.0
[1.3.0]: https://github.com/qiick-io/externa-core/releases/tag/v1.3.0
[1.2.3]: https://github.com/qiick-io/externa-core/releases/tag/v1.2.3
[1.2.2]: https://github.com/qiick-io/externa-core/releases/tag/v1.2.2
[1.0.0]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0
[1.0.0-beta.4]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.4
[1.0.0-beta.2]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/qiick-io/externa-core/releases/tag/v1.0.0-beta.1
