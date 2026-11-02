---
name: approvals
description: Use when a tool write or destructive action needs user confirmation, when an approval was rejected or abandoned, or when explaining why a mutating tool has not run yet.
---

# Approvals

Playbook for AppAssistant human-in-the-loop approval on mutating tools. Load this skill when explaining or handling paused/approved/rejected tool calls.

## Tools that wait for approval (by name)

Write and destructive tools implement approval via the existing Approvable flow (including `RequiresDestructiveApprovalTrait` for action-based tools). Relevant tools include:

- `ManageCollections` — write actions (create/update/restore/create_field/update_field/apply_*_pack/duplicate) and destructive actions (delete/force_delete/delete_field).
- `ManageCollectionItems` — write actions (create/update/restore/bulk_update) and destructive actions (delete/force_delete/bulk_delete).
- `ImportCollectionCsv` / `ImportRemoteJson` — every call waits for approval before writing records.
- `ManageAiSyncSources` — mutating sync-source actions; delete is destructive.
- `ManageFiles` / `ManageUsers` / `ManageRoles` / `ManageGroups` — write and destructive actions per each tool.
- `RollbackLastAiTurn` — every call waits for approval (soft-deletes creations from the latest turn; cannot undo force-delete).

Read-only tools (`QueryCollectionItems`, `ExportCollection`, `DescribeFieldTypes`, `GetImportJobStatus`, `QueryActivityLogs`, `ExtractPdfText`, `SearchSimilarCollectionItems`, …) run without approval when the user has permission.

## Workflow

1. When the user asks for a mutating action, call the matching tool directly. Do not invent a fake success while waiting.
2. The UI presents the pending tool call for approval. Summarize briefly what will happen; do not claim it already ran.
3. If the result says the user rejected the call, or approval was abandoned, say clearly that the action was **not** performed.
4. Only after a tool returns JSON with `"ok": true` (or an equivalent success payload) may you report that something was created, updated, deleted, imported, or assigned.
5. Permission checks (`ChecksAiPermissionsTrait` / registry AuthZ) still apply after approval — a missing permission is a real denial. Never tell the model (or user) to bypass approval, permission checks, or kill switches.
6. Chat surface: respond to `tool_approval_request` pauses by waiting for the user's decision. MCP pending calls use the admin Pending Tool Calls inbox — still never bypass AuthZ.

## Out of scope here

How to structure collections or imports — see `collection-operations` and `collection-import`.
