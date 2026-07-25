import { PermissionEnum } from '@/enums/permission-enum';

/** UI category bucket for grouping AI action presets in the drawer. */
export type AiActionPresetCategory =
    | 'common'
    | 'data'
    | 'files'
    | 'admin'
    | 'advanced';

/** Pre-built AI prompt template shown in the action presets drawer. */
export type AiActionPreset = {
    id: string;
    category: AiActionPresetCategory;
    title: string;
    description: string;
    prompt: string;
    /** Permissions that unlock this preset in the UI (any). Empty = always shown if CanUseAi. */
    anyOf?: PermissionEnum[];
    destructive?: boolean;
};

/**
 * English fallback labels for {@link AiActionPresetCategory}.
 * UI uses `ai.categories.*` via react-i18next; keep these for non-React callers.
 */
export const AI_ACTION_PRESET_CATEGORY_LABELS: Record<
    AiActionPresetCategory,
    string
> = {
    common: 'Common',
    data: 'Data & import',
    files: 'Files',
    admin: 'Admin',
    advanced: 'Advanced',
};

/**
 * Built-in AI action presets shipped with the assistant UI.
 * Titles/descriptions are English source strings; the drawer localizes via `ai.presets.<id>.*`.
 * Prompt bodies stay English-neutral so the agent matches reply language to the user.
 */
export const AI_ACTION_PRESETS: AiActionPreset[] = [
    {
        id: 'apply-seo-collection-pack',
        category: 'common',
        title: 'Apply SEO collection',
        description: 'Create the standalone SEO entity collection',
        prompt:
            'Apply the SEO collection pack.\n\nUse ManageCollections action apply_collection_pack with pack=seo.\n\nThis creates the `seo` collection with short field names (title, description, keywords, alternate, canonical, robots, noindex, og_image, facebook_image, twitter_image) — not seo_* prefixes. Summarize created vs reused.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'scaffold-articles',
        category: 'common',
        title: 'Scaffold Articles',
        description: 'Articles + Categories + SEO (deps auto-created)',
        prompt:
            'Scaffold Articles with dependencies.\n\nUse ManageCollections action apply_collection_pack with pack=articles.\n\nThis auto-creates `seo` and `categories` if missing, then `articles` with M2O relations to both. Do NOT invent the schema with N× create_field. Summarize collections and fields created vs skipped.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'scaffold-products',
        category: 'common',
        title: 'Scaffold Products',
        description: 'Products + Categories + SEO (deps auto-created)',
        prompt:
            'Scaffold Products with dependencies.\n\nUse ManageCollections action apply_collection_pack with pack=products.\n\nThis auto-creates `seo` and `categories` if missing, then `products` with M2O relations. Summarize created vs skipped.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'apply-publishing-field-pack',
        category: 'common',
        title: 'Apply publishing field pack',
        description: 'status, published_at, featured on an existing collection',
        prompt:
            'On collection «COLLECTION_ID_OR_NAME», apply the publishing field pack.\n\nUse ManageCollections action apply_field_pack with pack=publishing (resolve collection_id via list/get if I gave a name).\n\nAdds: status (select draft/published/archived), published_at (date), featured (boolean). Skip existing names. Summarize created vs skipped.',
        anyOf: [PermissionEnum.CanEditCollections],
    },
    {
        id: 'apply-contact-field-pack',
        category: 'common',
        title: 'Apply contact field pack',
        description: 'email, phone, address fields',
        prompt:
            'On collection «COLLECTION_ID_OR_NAME», apply the contact field pack.\n\nUse ManageCollections action apply_field_pack with pack=contact. Summarize created vs skipped.',
        anyOf: [PermissionEnum.CanEditCollections],
    },
    {
        id: 'apply-social-field-pack',
        category: 'common',
        title: 'Apply social field pack',
        description: 'Social profile URL fields',
        prompt:
            'On collection «COLLECTION_ID_OR_NAME», apply the social field pack.\n\nUse ManageCollections action apply_field_pack with pack=social. Summarize created vs skipped.',
        anyOf: [PermissionEnum.CanEditCollections],
    },
    {
        id: 'apply-seo-inline-field-pack',
        category: 'common',
        title: 'Apply SEO inline field pack',
        description: 'Denormalized seo_* fields (edge case)',
        prompt:
            'On collection «COLLECTION_ID_OR_NAME», apply the SEO inline field pack (denormalized seo_* fields).\n\nUse ManageCollections action apply_field_pack with pack=seo_inline (resolve collection_id via list/get if I gave a name).\n\nPrefer apply_collection_pack pack=seo + M2O relation for Articles/Pages/Products. Use seo_inline only when I explicitly want inline fields.\n\nDo NOT create them with N× create_field. Summarize created vs skipped.',
        anyOf: [PermissionEnum.CanEditCollections],
    },
    {
        id: 'new-typed-collection',
        category: 'common',
        title: 'New typed collection',
        description: 'Create a schema with typed fields from a description',
        prompt:
            'Create a new collection named «COLLECTION_NAME» with these typed fields (use create_field with the correct type, not generic string):\n- …\nThen summarize id, slug, and created fields.',
        anyOf: [
            PermissionEnum.CanCreateCollections,
            PermissionEnum.CanEditCollections,
        ],
    },
    {
        id: 'list-collections',
        category: 'common',
        title: 'List collections',
        description: 'Show existing collections with ids and fields',
        prompt:
            'List my collections (id, name, slug, item count). If I name one, also show its fields.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'import-csv',
        category: 'data',
        title: 'Import attached CSV',
        description: 'Create/update a collection from a CSV in chat',
        prompt:
            'I attached a CSV. Import it into a collection named «COLLECTION_NAME» (create it if missing). Infer field types from the content. At the end tell me how many items were created/updated.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-excel',
        category: 'data',
        title: 'Import attached Excel',
        description: 'Import from a .xlsx file',
        prompt:
            'I attached an Excel (.xlsx) file. Import it into collection «COLLECTION_NAME» (create if needed), with type inference. Summarize the result.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-url-json',
        category: 'data',
        title: 'Import JSON from URL',
        description: 'Remote JSON fetch → collection',
        prompt:
            'Import JSON data from this URL into collection «COLLECTION_NAME»:\nURL: https://…\nIf Bearer auth is required, ask me first. Infer types and summarize how many records you imported.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-dry-run',
        category: 'data',
        title: 'Import preview (dry-run)',
        description: 'Simulate without writing data',
        prompt:
            'Run dry_run=true (no writes) on the attachment or URL import I specify. Show proposed schema, inferred types, and a preview of the first rows.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'import-upsert',
        category: 'data',
        title: 'Sync / upsert',
        description: 'Re-import without duplicates (unique key)',
        prompt:
            'Upsert sync into collection «COLLECTION_NAME» using field «KEY_FIELD» as the key (e.g. sku or external id). Update existing items and create only new ones. Source: attachment or URL I provide.',
        anyOf: [PermissionEnum.CanCreateCollections, PermissionEnum.CanEditCollections],
    },
    {
        id: 'export-collection',
        category: 'data',
        title: 'Export collection',
        description: 'Export CSV or JSON',
        prompt:
            'Export collection «COLLECTION_NAME» as CSV (or JSON if I ask otherwise). Give a summary and the content or generated path.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'bulk-edit',
        category: 'data',
        title: 'Bulk edit items',
        description: 'Update many items with a filter',
        prompt:
            'In collection «COLLECTION_NAME», bulk-update items where «FIELD» = «VALUE» setting: …\nConfirm how many records match first, then run.',
        anyOf: [PermissionEnum.CanEditCollections],
        destructive: true,
    },
    {
        id: 'bulk-delete',
        category: 'data',
        title: 'Bulk delete items',
        description: 'Soft-delete filtered items',
        prompt:
            'In collection «COLLECTION_NAME», soft-delete items where «FIELD» = «VALUE». Tell me how many would match first, then proceed only after confirmation.',
        anyOf: [PermissionEnum.CanDeleteCollections],
        destructive: true,
    },
    {
        id: 'nl-query',
        category: 'data',
        title: 'Natural-language query',
        description: 'Filter and count items',
        prompt:
            'On collection «COLLECTION_NAME», answer this question with real data (use query/list tools):\n«…»\nShow results in a short table.',
        anyOf: [PermissionEnum.CanShowCollections],
    },
    {
        id: 'pdf-to-schema',
        category: 'data',
        title: 'PDF → schema / data',
        description: 'Extract PDF text and propose a collection',
        prompt:
            'I attached a PDF. Extract the text, propose a typed collection schema, and if it makes sense, import structurizable records. Ask for confirmation before writing.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'duplicate-collection',
        category: 'data',
        title: 'Duplicate collection',
        description: 'Copy schema (and optionally samples)',
        prompt:
            'Duplicate the collection with id «ID» (schema only). If I also ask for sample data, copy the first items.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'restore-collection',
        category: 'data',
        title: 'Restore collection from trash',
        description: 'Restore soft-delete',
        prompt:
            'List trashed collections and restore the one named «NAME» (or id …).',
        anyOf: [PermissionEnum.CanRestoreCollections],
    },
    {
        id: 'manage-files',
        category: 'files',
        title: 'Organize files',
        description: 'Folders, move, rename',
        prompt:
            'In the file manager: list the current folder, then create/organize as I ask (folders, rename, move). Use ManageFiles action "move" with file_id and target_parent_id. Do not permanently delete without confirmation.',
        anyOf: [
            PermissionEnum.CanShowFiles,
            PermissionEnum.CanCreateFiles,
            PermissionEnum.CanEditFiles,
        ],
    },
    {
        id: 'move-files',
        category: 'files',
        title: 'Move files',
        description: 'Move files/folders into another folder',
        prompt:
            'Move files/folders «NAME_OR_ID» into folder «DESTINATION» (or root). For multiple items use ManageFiles action "move_many" (source_parent_id or file_ids_json + target_parent_id). For one item use "move". Then list the destination to confirm.',
        anyOf: [PermissionEnum.CanEditFiles],
    },
    {
        id: 'attach-file-to-item',
        category: 'files',
        title: 'Link file to an item',
        description: 'Set a file/image field on an item',
        prompt:
            'Find file «FILE_NAME» and the item in collection «COLLECTION_NAME», then link the file to field «field_name» (file/image/files).',
        anyOf: [
            PermissionEnum.CanShowFiles,
            PermissionEnum.CanEditCollections,
        ],
    },
    {
        id: 'save-attachment-to-files',
        category: 'files',
        title: 'Save chat attachment to Files',
        description: 'Copy attachment into the file manager',
        prompt:
            'Save this chat attachment into the File manager (root or «path»). Then tell me the created file id and path.',
        anyOf: [PermissionEnum.CanCreateFiles],
    },
    {
        id: 'create-role',
        category: 'admin',
        title: 'Create role with permissions',
        description: 'New Spatie role + sync permission names',
        prompt:
            'Create a role named «ROLE_NAME» (e.g. product-manager). First list available permissions (list_permissions), then assign a sensible set via permission_names_json (use exact names, e.g. can-show-collections, can-create-collections). Summarize id, name, and final permissions. Do not touch super-admin.',
        anyOf: [PermissionEnum.CanCreateRoles],
    },
    {
        id: 'list-roles',
        category: 'admin',
        title: 'List roles',
        description: 'Show roles and permission counts',
        prompt:
            'List existing roles (id, name, permission count). If I name one, also show assigned permission names.',
        anyOf: [PermissionEnum.CanShowRoles],
    },
    {
        id: 'create-group',
        category: 'admin',
        title: 'Create user group',
        description: 'Group with members and linked roles',
        prompt:
            'Create user group «GROUP_NAME» with description «…». Link roles «…» (role_names_json) and, if I pass ids, the members. Summarize the result.',
        anyOf: [PermissionEnum.CanCreateGroups],
    },
    {
        id: 'create-user',
        category: 'admin',
        title: 'Create user',
        description: 'New user with a role when possible',
        prompt:
            'Create a user with email «…», first and last name «…». Assign the role if I have permission; otherwise say what is missing.',
        anyOf: [PermissionEnum.CanCreateUsers],
    },
    {
        id: 'list-users',
        category: 'admin',
        title: 'List users',
        description: 'Active users list',
        prompt: 'List users (id, name, email). Filter if I give a criterion.',
        anyOf: [PermissionEnum.CanShowUsers],
    },
    {
        id: 'audit-activity',
        category: 'admin',
        title: 'Activity audit',
        description: 'What happened recently',
        prompt:
            'Use QueryActivityLogs to fetch recent relevant activity (collection, file, AI, auth). Filter by event/log_name/date if needed and summarize.',
        anyOf: [PermissionEnum.CanShowActivityLogs],
    },
    {
        id: 'async-large-import',
        category: 'advanced',
        title: 'Large background import',
        description: 'Async job with progress',
        prompt:
            'Import this source (attachment or URL) into collection «COLLECTION_NAME» asynchronously (async/job). Give me the job_id and update me on status.',
        anyOf: [PermissionEnum.CanCreateCollections],
    },
    {
        id: 'scheduled-sync',
        category: 'advanced',
        title: 'Scheduled URL sync',
        description: 'Periodic remote import',
        prompt:
            'Configure a periodic sync from URL https://… into collection «COLLECTION_NAME» with upsert on key «FIELD». Interval: every N minutes. Confirm what you created.',
        anyOf: [PermissionEnum.CanCreateCollections, PermissionEnum.CanEditCollections],
    },
    {
        id: 'rollback-last-turn',
        category: 'advanced',
        title: 'Undo last AI operation',
        description: 'Soft rollback of recent mutations',
        prompt:
            'Roll back mutations from the latest AI turn in this conversation if possible with soft-delete. Tell me what you restored and what cannot be undone.',
        anyOf: [PermissionEnum.CanDeleteCollections],
        destructive: true,
    },
];

/**
 * Filters presets to those the current user may run based on Spatie permissions.
 *
 * @param presets - Preset list to filter
 * @param can - Permission check from {@link useCan}
 * @returns Presets where at least one required permission passes (or none required)
 */
export function filterAiActionPresets(
    presets: AiActionPreset[],
    can: (permission: string) => boolean,
): AiActionPreset[] {
    return presets.filter((preset) => {
        if (!preset.anyOf || preset.anyOf.length === 0) {
            return true;
        }

        return preset.anyOf.some((permission) => can(permission));
    });
}
