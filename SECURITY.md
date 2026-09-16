# Security

Externa is a self-hosted CMS. **Operators own transport encryption, disk encryption, backups, and network exposure.** The application provides RBAC, secret redaction in audit trails, hashed credentials, and optional MFA — not end-to-end encryption of chat or activity payloads.

Longer docs: [Threat model & hosting](https://docs.externa.qiick.io/docs/threat-model) · [Pre-release security checklist](https://docs.externa.qiick.io/docs/security-checklist) · [Deployment](https://docs.externa.qiick.io/docs/deployment) · [Dependency audits (CI)](https://docs.externa.qiick.io/docs/contributing#dependency-audits-ci).

## Dependency audits

PRs run `composer audit` (lockfile, high+) and `npm audit --omit=dev` (high+) via `.github/workflows/audit.yml`. Failures are **blocking**. Do not use `npm audit fix --force` in CI. Triage: upgrade first; justified ignores need a PR note and follow-up.

## Code scanning & secrets (maintainers)

- **CodeQL** — `.github/workflows/codeql.yml` runs on PRs, `develop`/`main`, and weekly (**JavaScript/TypeScript**). PHP not in the current Actions language pack yet — re-enable when GitHub ships it. Review alerts under **Security → Code scanning**; fix or dismiss with reason.
- **Secret scanning** and **push protection** — enabled on `qiick-io/externa-core`. Org owners: **Settings → Code security** (repo or org defaults). If a push is blocked, rotate the secret and scrub history if needed.

Reporting app vulnerabilities is below; dependency audits are separate (#32).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

1. Email the maintainers (see the GitHub org / repo security contact), or use GitHub **Private vulnerability reporting** if enabled on the repository.
2. Include: Externa version (`composer.json`), deploy shape (SQLite/Postgres, reverse proxy), steps to reproduce, and impact.
3. Allow a reasonable window before public disclosure.

## Threat model (summary)

| In scope (app) | Out of scope (operator / platform) |
| --- | --- |
| Authn (password hash, optional TOTP / passkeys) | TLS termination / certificates |
| Authz (Spatie roles, collection/file ACL) | Database volume & backup encryption |
| Activity log access (`can-show-activity-logs`) | Host OS hardening, firewall, SSH |
| Not writing passwords / 2FA secrets / API key material into activity diffs | Protecting `APP_KEY` and `.env` on disk |
| Wysiwyg HTML sanitization, File Manager extension denylist + plain-text strip, permission middleware on admin/API | Physical access to the server |

**Assumption:** anyone with DB access **or** `APP_KEY` + app code can read application data, including chat bodies and activity properties. Laravel `encrypted` casts use `APP_KEY` on the server — that is **not** end-to-end encryption.

**Files pool:** uploads/renames reject a denylist of dangerous extensions (`ForbiddenUploadExtension`); name/metadata/tags are `strip_tags`’d (`PlainTextSanitizer`). Team chat attachments remain any-type until **Save to Files**. Details: [File manager — Upload security](https://docs.externa.qiick.io/docs/file-manager).

## Data handling defaults

| Data | Default |
| --- | --- |
| User passwords | Hashed (`password` cast); excluded from activity attribute logs |
| 2FA secrets / recovery codes | Hidden; excluded from activity logs |
| API keys | Stored as hash; `key_hash` excluded from activity logs |
| Sync bearer tokens | Laravel `encrypted` cast (server-side) |
| Chat message bodies | Plaintext in `chat_messages` (needed for search, hub, admin) |
| Activity log | Plaintext properties; chat entries store a short `body_preview` (≤120 chars), not full ciphertext |
| Activity retention | `config/activitylog.php` → `clean_after_days` (default **365**), cleaned by scheduler |

## Deploy checklist (host)

Use this when shipping a production instance. App-level gates: [Security checklist](https://docs.externa.qiick.io/docs/security-checklist).

- [ ] `APP_ENV=production`, `APP_DEBUG=false`, unique `APP_KEY` (never reuse across envs)
- [ ] **HTTPS** for the public origin (`APP_URL`); required for passkeys / secure cookies
- [ ] Strong `INITIAL_SUPER_ADMIN_*` before first seed; rotate after bootstrap if needed
- [ ] Production DB (Postgres/MySQL preferred); enable **storage/volume encryption** and encrypted backups
- [ ] Restrict who can open `/activity-logs` (permission `can-show-activity-logs`)
- [ ] Keep `.env` and backups off world-readable paths; limit shell access to operators
- [ ] Queue + scheduler running (`activitylog:clean`, file/AI jobs) — see [Operations](https://docs.externa.qiick.io/docs/operations)
- [ ] Review Public API CORS / API keys / IP allowlists — [Public CMS API](https://docs.externa.qiick.io/docs/public-cms-api) / [Deployment](https://docs.externa.qiick.io/docs/deployment)
- [ ] Optional: require MFA project-wide (`two_factor_required`) — [Passkeys](https://docs.externa.qiick.io/docs/passkeys)

## What we do not provide by default

- Column-level encryption of chat bodies or activity JSON
- Client-side E2EE for DMs / item chat
- Guarantees against a compromised application server
