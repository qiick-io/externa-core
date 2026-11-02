---
name: collection-import
description: Use when importing collection records from CSV/XLSX chat attachments, remote JSON/API URLs, PDF text extraction, queued import status, or scheduled remote sync sources.
---

# Collection import

Playbook for bringing external data into collections via AppAssistant tools. Load this skill before import/preview/sync work.

## Tools (by name)

- `ImportCollectionCsv` — import rows from an uploaded CSV/TXT/XLSX chat attachment. Pass `attachment_id` plus `collection_id` and/or `collection_name`. Supports header-inferred fields, `upsert_key`, and `dry_run` preview. Requires `CanCreateCollections`. Always waits for user approval before writing.
- `ImportRemoteJson` — fetch a remote JSON/API URL, flatten records (optional `profile=directus|wordpress`), create collection/fields when needed, then import. Supports `dry_run`, `upsert_key`, optional Bearer/`auth_header`. Requires `CanCreateCollections`. Always waits for user approval before writing.
- `ExtractPdfText` — extract text from a PDF chat attachment when the user needs contents before or alongside import.
- `GetImportJobStatus` — poll queued import progress by `job_id` after a large async import.
- `ManageAiSyncSources` — list/create/update/enable/disable/delete scheduled remote JSON sync sources.
- `ManageCollections` / `DescribeFieldTypes` — only as needed to inspect or prepare the target collection schema before import (see `collection-operations`).

## Workflow

1. Prefer `dry_run: true` first when the user wants a preview or schema inference without writes.
2. For file uploads, use `attachment_id` values from `[AI_ATTACHMENTS]` — never invent attachment ids.
3. For remote JSON, validate with the user which URL and optional auth header to use; do not invent credentials.
4. Call the import tool directly; the UI asks for approval before writes. If rejected, say nothing was imported.
5. Large imports may return a `job_id` — follow up with `GetImportJobStatus` instead of claiming completion early.
6. For recurring remote pulls, use `ManageAiSyncSources` after a successful one-off import pattern is clear.
7. Permission denials from tools are authoritative — never claim an import succeeded without tool JSON success, and never instruct bypassing permission or approval checks.

## Out of scope here

General collection CRUD/packs belong in `collection-operations`. Approval UX details belong in `approvals`.
