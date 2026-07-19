<?php

namespace App\Ai\Agents;

use App\Ai\Tools\ExportCollection;
use App\Ai\Tools\ExtractPdfText;
use App\Ai\Tools\GetImportJobStatus;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageAiSyncSources;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\QueryActivityLogs;
use App\Ai\Tools\QueryCollectionItems;
use App\Ai\Tools\RollbackLastAiTurn;
use App\Ai\Tools\SearchSimilarCollectionItems;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Promptable;
use Stringable;

#[Provider('local')]
/**
 * Primary in-app AI assistant agent with tools for admin and content workflows.
 */
class AppAssistant implements Agent, Conversational, HasTools
{
    use Promptable;
    use RemembersConversations;

    public function __construct(private readonly ?User $user = null) {}

    /**
     * Allow create collection + one create_field per FieldTypeEnum + buffer for get/list/retries/final text.
     */
    public function maxSteps(): int
    {
        return count(FieldTypeEnum::cases()) + 16;
    }

    /**
     * Per-request HTTP timeout to the local model (seconds). Long tool loops need headroom.
     */
    public function timeout(): int
    {
        return 300;
    }

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        $capabilities = $this->capabilityLines();
        $capabilityBlock = $capabilities === []
            ? '- You currently have no mutating/domain tools. Refuse any create/update/delete request politely in Italian and explain that the user lacks permissions.'
            : implode("\n", $capabilities);
        $fieldTypes = implode(', ', FieldTypeEnum::values());

        return <<<INSTRUCTIONS
You are the internal assistant for this application.

Rules:
- Always use the provided tools for reads and writes. Never invent IDs, paths, or results.
- NEVER claim you created, updated, deleted, imported, or assigned anything unless a tool just returned JSON with "ok": true (or an equivalent success payload). If you did not call a tool, say you have not done it yet.
- When the user asks to create roles/permissions/groups/users, you MUST call ManageRoles / ManageGroups / ManageUsers. Do not answer with a fake success list.
- After create/get tool results, reuse the returned numeric ids for follow-up calls. Never invent collection_id/field_id/item_id/file_id/user_id/role_id.
- To add fields, call action create_field (not update_field) with the collection_id returned by create/get.
- You only have the tools listed below for this user. If the user asks for something without a matching tool, refuse politely in Italian (do not invent success).
- Respect permission errors from tools — tell the user clearly when a permission is missing.
- For destructive actions (delete / force-delete), confirm intent briefly, call the tool, then summarize what the tool returned.
- RollbackLastAiTurn can soft-delete records created in the latest turn, but cannot undo force-delete.
- Prefer concise answers in Italian when the user writes in Italian. When listing records, keep them short and actionable.
- Field names must be snake_case starting with a letter (e.g. seo_title). Pass field type as the enum value (string, textarea, boolean, …).
- Available field types: {$fieldTypes}. When asked for all field types, call create_field once per type.
- Always write a short final summary after tools finish.
- To create a role with permissions: call ManageRoles list_permissions, then create with permission_names_json (exact permission name strings). Never invent permission names.
- To assign a role to a user, use ManageUsers with role_names_json after the role exists. Groups can attach roles via ManageGroups role_names_json.
- Users may attach CSV, TXT, XLSX, or PDF files. Attachment metadata appears in [AI_ATTACHMENTS] with attachment_id values.
- For CSV/XLSX import, use ImportCollectionCsv. For remote JSON/API import, use ImportRemoteJson. Both support dry_run previews, inferred fields, and upsert_key.
- Use ExtractPdfText for PDF contents, QueryCollectionItems for filtered reads, QueryActivityLogs for Activity Log audits, and ExportCollection for CSV/JSON exports.
- For activity log / suspicious activity / strange or failed logins: ALWAYS call QueryActivityLogs when it is listed. Prefer log_name=auth with event=failed (and separately event=login if needed). Never claim you lack Activity Log access when QueryActivityLogs is available. date_from/date_to must be YYYY-MM-DD only.
- If a file type cannot be handled (or the model cannot read it), explain politely in Italian — do not crash or invent success.
- ManageFiles supports move and move_many. For one item use move (file_id + target_parent_id). To move many/all items into a folder: create_folder first, then ONE move_many with source_parent_id=0 (root) or file_ids_json — do not call move once per file. Never claim move is unavailable when ManageFiles is listed.
- After ManageFiles create/list/move/move_many, summarize briefly and include the returned file ids/names; the UI may render file cards from the tool payload.

Available capabilities for this user:
{$capabilityBlock}
INSTRUCTIONS;
    }

    /**
     * @return Tool[]
     */
    public function tools(): iterable
    {
        $user = $this->resolveUser();

        if ($user === null) {
            return [];
        }

        $resolver = app(EffectivePermissionResolver::class);
        $tools = [];

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowCollections,
            PermissionEnum::CanCreateCollections,
            PermissionEnum::CanEditCollections,
            PermissionEnum::CanDeleteCollections,
            PermissionEnum::CanRestoreCollections,
            PermissionEnum::CanForceDeleteCollections,
        ])) {
            $tools[] = new ManageCollections;
            $tools[] = new ManageCollectionItems;
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanCreateCollections->value)) {
            $tools[] = new ImportCollectionCsv;
            $tools[] = new ImportRemoteJson;
            $tools[] = new ExtractPdfText;
            $tools[] = new GetImportJobStatus;
            $tools[] = new ManageAiSyncSources;
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            $tools[] = new QueryCollectionItems;
            $tools[] = new ExportCollection;
            $tools[] = new SearchSimilarCollectionItems;
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanDeleteCollections->value)) {
            $tools[] = new RollbackLastAiTurn;
        }

        // ponytail: config('ai.mcp.enabled') stays opt-in until laravel/ai exposes stable agent MCP wiring.

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowFiles,
            PermissionEnum::CanCreateFiles,
            PermissionEnum::CanEditFiles,
            PermissionEnum::CanDeleteFiles,
            PermissionEnum::CanRestoreFiles,
            PermissionEnum::CanForceDeleteFiles,
        ])) {
            $tools[] = new ManageFiles;
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowUsers,
            PermissionEnum::CanCreateUsers,
            PermissionEnum::CanEditUsers,
            PermissionEnum::CanDeleteUsers,
            PermissionEnum::CanRestoreUsers,
            PermissionEnum::CanForceDeleteUsers,
        ])) {
            $tools[] = new ManageUsers;
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowRoles,
            PermissionEnum::CanCreateRoles,
            PermissionEnum::CanEditRoles,
            PermissionEnum::CanDeleteRoles,
        ])) {
            $tools[] = new ManageRoles;
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowGroups,
            PermissionEnum::CanCreateGroups,
            PermissionEnum::CanEditGroups,
            PermissionEnum::CanDeleteGroups,
            PermissionEnum::CanRestoreGroups,
            PermissionEnum::CanForceDeleteGroups,
        ])) {
            $tools[] = new ManageGroups;
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanShowActivityLogs->value)) {
            $tools[] = new QueryActivityLogs;
        }

        return $tools;
    }

    private function resolveUser(): ?User
    {
        if ($this->user instanceof User) {
            return $this->user;
        }

        $authenticated = auth()->user();

        return $authenticated instanceof User ? $authenticated : null;
    }

    /**
     * @param  list<PermissionEnum>  $permissions
     */
    private function canAny(EffectivePermissionResolver $resolver, User $user, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($resolver->hasPermission($user, $permission->value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function capabilityLines(): array
    {
        $user = $this->resolveUser();

        if ($user === null) {
            return [];
        }

        $resolver = app(EffectivePermissionResolver::class);
        $lines = [];

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowCollections,
            PermissionEnum::CanCreateCollections,
            PermissionEnum::CanEditCollections,
            PermissionEnum::CanDeleteCollections,
        ])) {
            $lines[] = '- Collections/items/fields via ManageCollections and ManageCollectionItems (subject to each action permission).';
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanCreateCollections->value)) {
            $lines[] = '- CSV import from chat attachments via ImportCollectionCsv (creates collection/fields from headers when needed; requires CanCreateCollections).';
            $lines[] = '- Remote JSON/API import via ImportRemoteJson (fetches a URL, flattens records, creates collection/fields when needed; requires CanCreateCollections).';
            $lines[] = '- XLSX import and PDF text extraction from chat attachments (requires CanCreateCollections).';
            $lines[] = '- Queued import status and scheduled remote JSON sync sources (requires CanCreateCollections).';
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            $lines[] = '- Filtered collection queries and CSV/JSON exports (requires CanShowCollections).';
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowFiles,
            PermissionEnum::CanCreateFiles,
            PermissionEnum::CanEditFiles,
            PermissionEnum::CanDeleteFiles,
        ])) {
            $lines[] = '- Files/folders via ManageFiles: list/search, create_folder, rename, move, move_many (bulk via source_parent_id or file_ids_json), delete, restore, force_delete, save_attachment (subject to each action permission).';
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowUsers,
            PermissionEnum::CanCreateUsers,
            PermissionEnum::CanEditUsers,
            PermissionEnum::CanDeleteUsers,
        ])) {
            $lines[] = '- Users via ManageUsers (subject to each action permission).';
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowRoles,
            PermissionEnum::CanCreateRoles,
            PermissionEnum::CanEditRoles,
            PermissionEnum::CanDeleteRoles,
        ])) {
            $lines[] = '- Roles and permission sync via ManageRoles (list_permissions, create/update with permission_names_json; super-admin is protected).';
        }

        if ($this->canAny($resolver, $user, [
            PermissionEnum::CanShowGroups,
            PermissionEnum::CanCreateGroups,
            PermissionEnum::CanEditGroups,
            PermissionEnum::CanDeleteGroups,
        ])) {
            $lines[] = '- User groups via ManageGroups (members + attached roles; soft-delete/restore/force-delete when permitted).';
        }

        if ($resolver->hasPermission($user, PermissionEnum::CanShowActivityLogs->value)) {
            $lines[] = '- Activity Log via QueryActivityLogs (auth logins: log_name=auth, event=login|logout|failed; dates YYYY-MM-DD; requires CanShowActivityLogs).';
        }

        return $lines;
    }
}
