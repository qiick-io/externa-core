# Upgrading Externa Core

Operator notes that do not belong in the Keep a Changelog file. Each release that needs an
extra warning gets a short section here; the full upgrade steps stay in `CHANGELOG.md`.

## 1.5.1

Do not run `migrate:rollback` through the `owner_id` API-key migration: it refuses and would
erase every recorded API key owner. Restore a pre-upgrade backup instead.
