# Security

Externa is a self-hosted CMS. **Operators own transport encryption, disk encryption, backups, and network exposure.** The application provides RBAC, secret redaction in audit trails, hashed credentials, and optional MFA — not end-to-end encryption of chat or activity payloads.

Longer docs: [Threat model & hosting](../externa-docs/src/app/docs/threat-model/page.md) · [Pre-release security checklist](../externa-docs/src/app/docs/security-checklist/page.md) · [Deployment](../externa-docs/src/app/docs/deployment/page.md).

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
| Wysiwyg HTML sanitization, permission middleware on admin/API | Physical access to the server |

**Assumption:** anyone with DB access **or** `APP_KEY` + app code can read application data, including chat bodies and activity properties. Laravel `encrypted` casts use `APP_KEY` on the server — that is **not** end-to-end encryption.

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

Use this when shipping a production instance. App-level gates: [Security checklist](../externa-docs/src/app/docs/security-checklist/page.md).

- [ ] `APP_ENV=production`, `APP_DEBUG=false`, unique `APP_KEY` (never reuse across envs)
- [ ] **HTTPS** for the public origin (`APP_URL`); required for passkeys / secure cookies
- [ ] Strong `INITIAL_SUPER_ADMIN_*` before first seed; rotate after bootstrap if needed
- [ ] Production DB (Postgres/MySQL preferred); enable **storage/volume encryption** and encrypted backups
- [ ] Restrict who can open `/activity-logs` (permission `can-show-activity-logs`)
- [ ] Keep `.env` and backups off world-readable paths; limit shell access to operators
- [ ] Queue + scheduler running (`activitylog:clean`, file/AI jobs) — see [Operations](../externa-docs/src/app/docs/operations/page.md)
- [ ] Review Public API CORS / API keys / IP allowlists — [Public CMS API](../externa-docs/src/app/docs/public-cms-api/page.md) / [Deployment](../externa-docs/src/app/docs/deployment/page.md)
- [ ] Optional: require MFA project-wide (`two_factor_required`) — [Passkeys](../externa-docs/src/app/docs/passkeys/page.md)

## What we do not provide by default

- Column-level encryption of chat bodies or activity JSON
- Client-side E2EE for DMs / item chat
- Guarantees against a compromised application server

Those are deliberate for a collaborative OSS CMS: search, admin audit, and AI tools need server-readable content. Harden the host instead.
