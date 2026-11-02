---
name: collection-operations
description: Use when creating, updating, querying, packing, exporting, or deleting CMS collections, fields, or items — including collection/field packs and filtered reads.
---

# Collection operations

Playbook for everyday collection and item work in the AppAssistant. Call `LoadSkill` with this skill before multi-step collection schema or content work.

## Tools (by name)

- `ManageCollections` — list/get/create/update/delete/restore/force_delete collections; create_field/update_field/delete_field; list_field_packs/apply_field_pack; list_collection_packs/apply_collection_pack; duplicate.
- `ManageCollectionItems` — list/get/create/update/delete/restore/force_delete items; bulk_update/bulk_delete; list_relation_options. Pass field values as JSON in `data_json`.
- `DescribeFieldTypes` — required before create_field/update_field on complex types (blocks, m2a, relations, map, files/image, api_autocomplete, checkbox_group_tree, …). Use only returned settings shapes.
- `QueryCollectionItems` — filtered reads when listing alone is not enough.
- `ExportCollection` — CSV/JSON export (requires show-collections permission).
- `SearchSimilarCollectionItems` — embedding similarity search when available.
- `RollbackLastAiTurn` — soft-delete records created in the latest AI turn (cannot undo force-delete). Always waits for user approval.

## Workflow

1. Before changing an existing collection, call `ManageCollections` with action `list` or `get`. Treat `get` as the source of truth for ids and settings. Never invent `collection_id`, `field_id`, `item_id`, or `settings_json`.
2. For SEO entity / Articles / Pages / Products / Categories scaffolds: call `apply_collection_pack` (after `list_collection_packs` if needed). Prefer packs over inventing schemas with many `create_field` calls. Dependencies auto-create.
3. For denormalized SEO or publishing/contact/social bundles on an existing collection: call `apply_field_pack`. Use `seo_inline` only when the user explicitly wants inline `seo_*` fields.
4. Field names must be snake_case starting with a letter. Pass field type as the enum value string.
5. After create/get results, reuse returned numeric ids for follow-up calls.
6. Destructive actions (`delete`, `force_delete`, `delete_field`, `bulk_delete`, rollback) and write actions go through the normal approval UI — call the tool; do not claim success until JSON returns `"ok": true`. If the user rejects approval, say the action was not performed.
7. Never invent success. Never bypass permission errors from tools — translate them clearly for the user.

## Out of scope here

Imports (`ImportCollectionCsv`, `ImportRemoteJson`, …) belong in the `collection-import` skill. Approval UX details belong in the `approvals` skill.
