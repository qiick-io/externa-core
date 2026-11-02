# AI prompt-injection & denied-permission suite (#204)

Deterministic Pest coverage under `tests/Feature/Ai/Security/*`. No live model calls, no network (`Http::preventStrayRequests()` + `Http::fake()`).

## Threat → test mapping

| Threat | How a compromised model acts | Guard that must hold | Primary assertion |
| --- | --- | --- | --- |
| Unapproved destructive write | Emits `ManageCollections` / `ManageCollectionItems` / `ManageFiles` delete/force_delete | Spatie abilities + write kill switch / allowlist + MCP `PendingToolCall` + tool-level `CanDelete*` | `denied` or `pending_approval` (viewers may pending via registry `canAny(show…)` but tool-level delete still blocks); counts unchanged |
| Unapproved write | Emits create/update tool calls | Same as above | Not `ok` without approval; no new collections/items |
| Data exfiltration | Emits `ImportRemoteJson` to attacker URL (optionally with bearer) | Abilities + write gate + approval + SSRF allowlist | Denied / pending; `Http::recorded()` empty |
| SSRF exfiltration | Emits import against link-local / metadata IPs | `SafeRemoteUrlValidator` (+ gates above) | Never `ok`; no outbound HTTP |
| Privilege escalation | Emits `ManageUsers` / `ManageRoles` / `ManageGroups` | Registry ability callbacks | `denied` for viewer/editor/limited |
| Prompt / audit disclosure | Emits `QueryActivityLogs` | `CanShowActivityLogs` | `denied` unless admin |
| Cross-collection read | Emits `QueryCollectionItems` / `ExportCollection` / `SearchSimilar…` on a “private” collection | Spatie `CanShowCollections` (and collection ACL when configured) | Files-only (“limited”) actor denied |
| Instruction-override / encoding variants | CMS body contains ignore-previous, base64, RTL, zero-width, HTML comments | Same as mapped tool threats — model compliance is irrelevant | Scripted driver still hits AuthZ |

## Surfaces & roles

- **Surfaces:** `chat` (`AiToolExecutorService` with `surface=chat`) and `mcp` (`RegistryMcpToolAdapter`).
- **Roles:** `viewer` (show collections), `editor` (show/create/edit), `admin` (broad manage + activity logs), `limited` (AI + show files only — API-token style).

## Driver & fixtures

- `Support/InjectionPayloadCatalog.php` — ≥20 adversarial CMS strings.
- `Support/CompromisedLlmDriver.php` — maps each payload id to concrete tool calls (fake LLM).
- `Support/AiSecurityFixture.php` — seeds collections/items/file containing those payloads.

## Mutation sanity

`it('fails open AuthZ if registry ability checks are bypassed…')` documents that ability-sensitive tools (`QueryActivityLogs`, `ManageUsers`) diverge between viewer and admin. Removing `actorPassesAbilities` in the registry/executor makes that (and the matrix denials) fail in CI.

## Optional live red-team

Out of scope for the CI gate (see issue #204). A future non-blocking job may run a live-model eval artifact; do not add network calls here.

## Run locally

```bash
php artisan test --compact tests/Feature/Ai/Security
```
