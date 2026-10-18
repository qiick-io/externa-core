# Issues to create — October 2026 Review

**GitHub creation status:** BLOCKED (see §0).  
**Report branch:** `cursor/review-2026-10-c1af`  
**Report:** [`docs/review/2026-10-review.md`](./2026-10-review.md)

---

## 0. Write failures (exact errors)

| Operation | Tool / command | Error | Missing permission |
|------------|----------------|--------|-------------------|
| Draft PR | `ManagePullRequest` | `Validation Failed: {"resource":"Issue","code":"custom","message":"must be a collaborator"}` | Collaborator / Pull requests: write |
| Draft PR | `gh pr create` | `GraphQL: Resource not accessible by integration (createPullRequest)` HTTP 403 | GitHub App: Pull requests write |
| Issue | `gh issue create` | `GraphQL: Resource not accessible by integration (createIssue)` HTTP 403 | GitHub App: Issues write |
| Label | `gh label create` | `HTTP 403: Resource not accessible by integration` | GitHub App: Issues write (labels) |
| Repo ACL | `gh api .../collaborators/cursor/permission` | `permission: none`, `push/triage/pull: false` | App installation / collaborator Write |

**Note:** the existing issues (#112–#125, #180–#181) were created by the human user `LucaGiardi20`, not by this agent's token. Pushing the branch works; creating PRs/issues/labels does not.

**Projects:** no GitHub Project (Projects V2) found on `qiick-io`.

**Retry after grant:** ask the agent to re-run PR + issue creation from this file.

---

## 1. Milestone distribution rationale

### Existing milestones

| Milestone | Purpose (from GitHub) | What goes there from this review |
|-----------|-------------------|-----------------------------|
| **1.2.0** | Editorial product features (kanban, approvals, …) | **Nothing new** — #47 Kanban/Calendar already `COMPLETED` |
| **1.3.0** | Platform hardening: rate limits, AuthZ suite, API key scopes, upload security, N+1 | **Only hardening already in existing issues** + at most 1–2 critical security micro-fixes not yet covered |
| **1.4.0** | Operator scale: workspaces, MCP, field ACL, transforms, deep filters, bulk API | File library perf, security headers (defense-in-depth), storage adapters |
| **1.5.0** *(to create)* | AI & media intelligence (post–laravel/ai 1.1) | File classification, moderation gate, AI product features |

### Principle

> **1.3.0 gets only critical security/hardening fixes.** AI features, non-security Directus parity, scale tech-debt → 1.4.0 or 1.5.0.

### Deduplication vs existing issues

| Report proposal | Decision | Reason |
|-----------------|-----------|--------|
| NEW-1 cost-based rate limit | **DO NOT create** | Covered by **#113** |
| NEW-2 MIME allowlist + magic bytes | **DO NOT create** | Covered by **#118** (extend #118 in a comment if magic bytes are needed) |
| NEW-3 GraphQL depth/complexity | **DO NOT create** | Covered by **#113** (“include-depth caps”) |
| NEW-4 `effective_access` denormalize | **Create → 1.4.0** | Operator scale, not critical 1.3.0 hardening; related to #117 but distinct |
| NEW-5 security headers | **Create → 1.4.0** | Defense-in-depth, low priority; does not block 1.3.0 |
| NEW-6 AI file classification | **Create → 1.5.0** | Depends on #180; AI product feature, not hardening |
| NEW-7 AI moderation publish | **Create → 1.5.0** | AI feature; after #180 |
| NEW-8 Kanban/Calendar | **DO NOT create** | Duplicate of **#47** (CLOSED/COMPLETED, milestone 1.2.0) |
| NEW-9 GCS / Azure Blob | **Create → 1.4.0** | Operator scale / storage; S3 already exists |
| NEW-10 Streaming SHA-256 upload | **Create → 1.4.0** | Memory tech-debt (`FileService` ponytail) |
| NEW-11 CI `composer audit` + `npm audit` | **Create → 1.3.0** | Pipeline hardening; the only new security item for 1.3.0 not already in #112–#118 |
| NEW-12 Webhook HMAC `hash_equals` audit | **Create → 1.3.0** | Critical security micro-fix (timing-safe compare) |

### Final map (to create)

```
1.3.0  →  NEW-11 (CI audit), NEW-12 (HMAC hash_equals)
1.4.0  →  NEW-4 (effective_access), NEW-5 (security headers), NEW-9 (GCS/Azure), NEW-10 (streaming hash)
1.5.0  →  NEW-6 (AI classify), NEW-7 (AI moderate)   [create milestone 1.5.0]
SKIP   →  NEW-1, NEW-2, NEW-3, NEW-8
```

**No dumping everything into 1.3.0.** AI features go to 1.5.0 because 1.4.0 is already full of operator-scale work and AI is not “platform hardening”.

---

## 2. Labels to create (if missing)

Existing: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`, `UI`, `area:dx`.

**To create:**

| Label | Color | Use |
|-------|--------|-----|
| `type:security` | `#B60205` | Security / AuthZ / upload |
| `type:performance` | `#FBCA04` | Perf / N+1 / memory |
| `type:ai` | `#5319E7` | Laravel AI / vision / MCP-adjacent |
| `type:chore` | `#CFD3D7` | CI / deps / ops |
| `area:api` | `#1D76DB` | Public API / GraphQL |
| `area:files` | `#0E8A16` | File manager / storage |
| `area:authz` | `#D93F0B` | Permissions / RBAC |
| `priority:P0` | `#B60205` | Critical |
| `priority:P1` | `#D93F0B` | High |
| `priority:P2` | `#FBCA04` | Medium |
| `priority:P3` | `#C2E0C6` | Low |
| `severity:critical` | `#B60205` | Security only |
| `severity:high` | `#D93F0B` | |
| `severity:medium` | `#FBCA04` | |
| `severity:low` | `#C2E0C6` | |
| `effort:S` | `#EDEDED` | ≤1 day |
| `effort:M` | `#BFD4F2` | 2–3 days |
| `effort:L` | `#D4C5F9` | 4–5+ days |

---

## 3. Issue specs (agent-ready, English)

> Once write access is available, create them in the order below. Each body is self-contained for a coding agent.

---

### ISSUE A — NEW-11 · Milestone **1.3.0** · effort:S · priority:P1 · severity:high

**Title:** `ci(security): weekly composer audit + npm audit workflow`

**Labels:** `type:chore`, `type:security`, `area:dx`, `priority:P1`, `severity:high`, `effort:S`, `enhancement`

**Body:**

```markdown
## Context

The October 2026 review (`docs/review/2026-10-review.md` §1.5) highlights that there is no periodic CI job for PHP/JS dependency vulnerabilities. Milestone **1.3.0** is “platform hardening”: this is the only new pipeline-hardening security issue not already covered by #112–#118.

## Goal

Add a GitHub Actions workflow that runs `composer audit` and `npm audit --audit-level=moderate` on a weekly schedule + on pushes to `main`/`develop`, and fails CI if there are advisories above the threshold.

## File references

- New: `.github/workflows/security-audit.yml`
- Existing: `composer.json`, `package.json`, any workflows in `.github/workflows/`

## Implementation steps

1. Create `.github/workflows/security-audit.yml` with:
   - `on.schedule` (e.g. Monday 00:00 UTC) and `on.push` on the main branches + `workflow_dispatch`
   - Node 24 + PHP 8.4 job (aligned with `.nvmrc` / `composer.json`)
   - Step: `composer install --no-interaction` → `composer audit`
   - Step: `npm ci` → `npm audit --audit-level=moderate`
2. Document in `SECURITY.md` or the ops docs how to interpret failures.
3. If `composer audit` is not available in the project's Composer version, use the documented equivalent command and fail explicitly.

## Acceptance criteria

- [ ] Workflow present and runnable via `workflow_dispatch`
- [ ] Fails on moderate+ advisories (npm) / known vulnerabilities (composer)
- [ ] No hardcoded secrets
- [ ] Documented where to read the results

## Testing notes

- Run `act` or `workflow_dispatch` on a test branch.
- Verify that a fake advisory (if possible in a fork) fails the job.

## Out of scope

- Auto-PRs for dependency bumps (Dependabot/Renovate).
- Fixing the vulnerabilities found (separate issues).

## Related

- Milestone 1.3.0 hardening
- Report: `docs/review/2026-10-review.md` §1.5
```

---

### ISSUE B — NEW-12 · Milestone **1.3.0** · effort:S · priority:P0 · severity:critical

**Title:** `security(ai): verify collection-import webhook HMAC with hash_equals`

**Labels:** `type:security`, `area:api`, `priority:P0`, `severity:critical`, `effort:S`, `bug`

**Body:**

```markdown
## Context

Oct 2026 review §1.2.2: the `POST /ai/webhooks/collection-import` webhook uses `AI_WEBHOOK_TOKEN` / the `X-AI-Webhook-Signature` header. The signature comparison must be **timing-safe** (`hash_equals`), otherwise there is a risk of a timing leak of the HMAC secret.

## Goal

Audit + fix (if needed) the signature validation in `CollectionImportWebhookRequest` (or the related middleware/controller): HMAC SHA-256 over the raw body, comparison with `hash_equals`, 401 on mismatch, feature test.

## File references

- `app/Http/Requests/Ai/CollectionImportWebhookRequest.php`
- `app/Http/Controllers/Ai/CollectionImportWebhookController.php`
- `routes/ai.php`
- `.env.example` (`AI_WEBHOOK_TOKEN`)
- Tests: `tests/Feature/Ai/*` (create if missing)

## Implementation steps

1. Read the current signature verification implementation.
2. If it uses `===` / `strcmp` / a non-constant-time string comparison → replace with `hash_equals($expected, $provided)`.
3. Compute `$expected = hash_hmac('sha256', $request->getContent(), $token)`.
4. Empty token in production → fail closed (503/401), do not accept unsigned requests.
5. Add feature tests: valid signature → 2xx; invalid signature → 401; tampered body → 401.

## Acceptance criteria

- [ ] Signature comparison only via `hash_equals`
- [ ] No webhook accepted without a configured token (in non-local environments if applicable)
- [ ] Green Pest tests for happy path + 2 failure modes
- [ ] The secret is never logged in clear text

## Testing notes

```bash
php artisan test --compact --filter=CollectionImportWebhook
```

## Out of scope

- Automatic token rotation (`ai:rotate-webhook-token`) — separate issue if needed.
- Auth other than HMAC (mTLS, OAuth).

## Related

- Report §1.2.2
- Milestone **1.3.0** (the only critical security micro-fix besides the already open issues #113/#118)
```

---

### ISSUE C — NEW-4 · Milestone **1.4.0** · effort:M · priority:P1 · severity:medium

**Title:** `perf(files): denormalize effective_access on the files table`

**Labels:** `type:performance`, `area:files`, `area:authz`, `priority:P1`, `severity:medium`, `effort:M`, `enhancement`

**Body:**

```markdown
## Context

`FilePermissionGuard::effectivelyPrivateIds()` loads `id/parent_id/access` of **all** files into memory and resolves parent→child inheritance (*ponytail* comment in `app/Services/Api/FilePermissionGuard.php` ~L70–115). On large libraries → OOM risk and slow listings. This is not critical 1.3.0 hardening: it is **operator scale** → milestone **1.4.0**.

## Goal

Introduce a denormalized (indexed) `effective_access` column, maintained by an observer/service on create/move/update of `access`/`parent_id`, and use it in `constrainReadable` / listings instead of the full-tree scan.

## File references

- `app/Services/Api/FilePermissionGuard.php` (L70–115 and `constrainReadable`)
- `app/Models/File.php`
- `app/Enums/FileAccess.php`
- `app/Services/FileService.php` (`move`, `createFolder`, update access)
- Migrations `database/migrations/*files*`
- Tests: `tests/Feature/Api/PublicFilesApiTest.php`, `tests/Feature/Files/*`

## Implementation steps

1. Migration: nullable string `files.effective_access` + index; artisan backfill command that walks the tree once.
2. Observer or hook in `FileService` on save/move: recompute the node + descendants if access/parent changes.
3. `FilePermissionGuard::effectivelyPrivateIds()` → query `where('effective_access', private)` (or remove the method in favor of a direct where).
4. Invalidate the grants cache if needed (`forget`).
5. Feature tests: file private by inheritance; moving under a private parent updates effective access; list API excludes correctly.

## Acceptance criteria

- [ ] No full-table load in the list hot path
- [ ] Idempotent backfill command
- [ ] AuthZ behavior unchanged vs the existing suite (+ new tests)
- [ ] The meaning of `effective_access` vs `access` documented

## Testing notes

```bash
php artisan test --compact tests/Feature/Api/PublicFilesApiTest.php
php artisan test --compact --filter=FilePermission
```

## Out of scope

- Field-level ACL (#122)
- Workspaces (#120)

## Related

- #117 (list query audit) — related but not a replacement
- #114 (AuthZ regression) — update the suite after the change
- Report §2.1.1
```

---

### ISSUE D — NEW-5 · Milestone **1.4.0** · effort:S · priority:P3 · severity:low

**Title:** `security: SetSecurityHeaders middleware (CSP, X-Frame-Options, Referrer-Policy)`

**Labels:** `type:security`, `priority:P3`, `severity:low`, `effort:S`, `enhancement`

**Body:**

```markdown
## Context

Review §1.7.1: defense headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) are missing on the admin panel. Not blocking for 1.3.0 → **1.4.0**.

## Goal

`SetSecurityHeaders` middleware registered on the web (Inertia) group, with a pragmatic CSP (Vite/Inertia), without breaking Echo/Reverb or CDN assets.

## File references

- New: `app/Http/Middleware/SetSecurityHeaders.php`
- `bootstrap/app.php` (middleware registration)
- Optional `config/security.php`

## Steps

1. Implement the middleware with headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or SAMEORIGIN if embedding is needed), `Referrer-Policy`, restrictive `Permissions-Policy`.
2. Baseline CSP for the admin; do not apply an aggressive CSP to `/api/*` if it breaks third-party clients.
3. Feature/browser smoke test: login + dashboard load; no Vite script blocking locally.
4. Document env overrides if needed.

## Acceptance criteria

- [ ] Headers present on admin HTML responses
- [ ] Public API not broken
- [ ] Test or HTTP assertion on the main headers

## Out of scope

- HSTS (belongs on the reverse proxy)
- CSP report-uri pipeline

## Related

- Report §1.7.1
```

---

### ISSUE E — NEW-9 · Milestone **1.4.0** · effort:M · priority:P3 · severity:low

**Title:** `feat(files): Google Cloud Storage and Azure Blob storage adapters`

**Labels:** `area:files`, `enhancement`, `priority:P3`, `severity:low`, `effort:M`

**Body:**

```markdown
## Context

Directus parity (review §4 / NEW-9): today `FILES_DISK` supports local `assets` and S3-compatible storage. Enterprise operators ask for native GCS/Azure without an S3 gateway.

## Goal

Add Flysystem disks for GCS and Azure Blob, documented in `.env.example` + docs, with smoke tests (mock or optional container).

## References

- `config/filesystems.php`
- `app/Support/Files/FilesDisk.php`
- `.env.example` / `.env.docker*.example`
- `league/flysystem-aws-s3-v3` already present — add the official adapters **only after dependency approval**

## Steps

1. Request/obtain approval for new Composer dependencies (`flysystem-google-cloud-storage` / Azure).
2. Disk config + env keys.
3. Verify that upload/move/transform paths use the abstract `FilesDisk`.
4. Installation docs.
5. Unit tests on disk resolution + feature tests skipped without credentials.

## Acceptance criteria

- [ ] `FILES_DISK=gcs|azure` works in config
- [ ] Complete docs
- [ ] No regressions on `assets`/`s3`

## Out of scope

- Automatic migration between disks
- CDN purge

## Related

- #123 asset transforms (same files area, milestone 1.4.0)
```

---

### ISSUE F — NEW-10 · Milestone **1.4.0** · effort:S · priority:P2 · severity:medium

**Title:** `perf(files): streaming SHA-256 hashing on upload (no full load into RAM)`

**Labels:** `type:performance`, `area:files`, `priority:P2`, `severity:medium`, `effort:S`, `enhancement`

**Body:**

```markdown
## Context

`FileService::uploadFile` calls `$uploadedFile->getContent()` for meta + hash (ponytail ~L82–85): large files → memory spikes. Operator scale → **1.4.0**.

## Goal

Compute SHA-256 (and, if possible, image meta) via streaming / file path, without loading the whole blob into a PHP string.

## References

- `app/Services/FileService.php` (`uploadFile`, `extractImageMeta`)
- `app/Services/FileChunkUploadService.php` (align finalize)
- Tests: `tests/Feature/Files/FileChunkUploadServiceTest.php`, `tests/Feature/Admin/FileManagerTest.php`

## Steps

1. `hash_init` / `hash_update_stream` / `hash_final` on the real path.
2. Avoid double reads where possible.
3. Test with a fixture > a few MB (or a mock) verifying a stable hash.
4. Comment/remove the obsolete ponytail.

## Acceptance criteria

- [ ] Hash identical to the previous method on the fixture
- [ ] No `getContent()` on the main upload path
- [ ] Green tests

## Out of scope

- Cross-disk dedup
- Virus scanning
```

---

### ISSUE G — NEW-6 · Milestone **1.5.0** *(to create)* · effort:L · priority:P2 · severity:low

**Title:** `feat(ai): automatic file classification (vision) + folder reorganization`

**Labels:** `type:ai`, `area:files`, `enhancement`, `priority:P2`, `severity:low`, `effort:L`

**Depends on:** #180 (`laravel/ai` ^1.1)

**Body:**

```markdown
## Context

Full design in `docs/review/2026-10-review.md` §3. Goal: after uploading images/PDFs, an asynchronous job classifies them (category, tags, colors, OCR), writes `ai_metadata`, optionally moves them into folders (`Products`, `Documents`, …) and applies Spatie tags. AI product feature → **milestone 1.5.0** (not 1.3.0 hardening, not 1.4.0 operator core).

## Goal

Ship end-to-end behind the `AI_AUTO_CLASSIFY_FILES=false` flag, off by default.

## Design references

- Report §3.3 (migration, `ClassifyFileJob`, `FileClassificationService`, `FileAiMetadata` UI)
- `app/Services/FileService.php` (post-upload hook)
- `app/Ai/Tools/ManageFiles.php` (do not replace: orchestrate via the job)
- Horizon queue

## Steps

1. Wait for #180 to be merged.
2. Migration `ai_metadata` JSON, `ai_processed`, `ai_processed_at`.
3. Service + Job + cost/model config.
4. Read-only metadata UI in the file detail view.
5. Feature tests with a fake AI provider / Http::fake.
6. Cost docs (~$34/1k uploads GPT-4V) and opt-in.

## Acceptance criteria

- [ ] Off by default; opt-in via env
- [ ] Only classifiable MIME types
- [ ] File permissions respected (no private leaks)
- [ ] Idempotent / retry-safe job
- [ ] Tests without real network calls in CI

## Out of scope

- Training custom models
- Auto-deleting duplicates (suggest only)
- MCP (#121) — separate

## Related

- #180, #181, report §3
```

---

### ISSUE H — NEW-7 · Milestone **1.5.0** · effort:M · priority:P3 · severity:low

**Title:** `feat(ai): content moderation gate before publish`

**Labels:** `type:ai`, `enhancement`, `priority:P3`, `severity:low`, `effort:M`

**Depends on:** #180

**Body:**

```markdown
## Context

Report §3.4.3: optional AI check (NSFW / policy) in `CollectionItemPublisher` before publishing. Milestone **1.5.0**.

## Goal

Per-collection setting `ai_moderation_on_publish`; if on, block publishing with a 422 and a reason; audit log.

## References

- `app/Services/Collections/CollectionItemPublisher.php`
- Collection settings / project settings
- Collections publish/schedule tests

## Steps

1. Setting flag + minimal UI.
2. Moderation API call via laravel/ai (or the configured provider).
3. Fail open vs fail closed documented (recommendation: fail closed if the AI is down and the flag is on).
4. Tests with a fake.

## Acceptance criteria

- [ ] Flag off = unchanged behavior
- [ ] Flag on + flagged content = no publish
- [ ] Activity log entry
- [ ] Docs

## Out of scope

- Image moderation (covered by classify)
- Human review queue (approvals #48 already closed in 1.2.0)
```

---

## 4. Milestone 1.5.0 (to create)

**Title:** `1.5.0`  
**Description:**

```text
AI & media intelligence after laravel/ai ^1.1: automatic file classification/vision, content moderation gates, and related operator AI product features.

Not for platform hardening (1.3.0) or workspaces/MCP/field-ACL (1.4.0). Depends on #180.
```

---

## 5. Comments to leave on existing issues (instead of duplicates)

### On #113
Add a note: also implement a **cost-based** token bucket (mutations=5, include=2) and Lighthouse `max_query_depth` / `max_query_complexity` as in report §1.1.1–1.1.2. Do not create separate issues NEW-1/NEW-3.

### On #118
Add a note: besides the MIME allowlist, include **magic bytes** for pdf/jpeg/png/gif as in report §1.3.1. Do not create NEW-2.

### On #47
No action — COMPLETED; Kanban/Calendar already shipped. NEW-8 discarded.

---

## 6. Post-grant checklist

1. [ ] Create labels (§2)
2. [ ] Create milestone `1.5.0` (§4)
3. [ ] Create issues A–H with the correct milestone/labels
4. [ ] Comment on #113 and #118 (§5)
5. [ ] Open a draft PR from `cursor/review-2026-10-c1af` → `main` (or `develop` if that is the official base)
6. [ ] Link the PR to the report; optionally a Project if one is created

**PR base branch:** verify the default (`main` vs `develop`). The cloud instructions indicate base `main` for this agent; the repo also uses workflows on develop — align with the team's practice.
