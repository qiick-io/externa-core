/** Collection row as stored in list/admin tables (without embedded fields). */
export type CollectionStatus = 'active' | 'inactive';

/** Native `<input type="color">` requires a value; not stored unless the user picks one. */
export const COLLECTION_COLOR_PICKER_FALLBACK = '#64748B'; // slate-500

const COLLECTION_COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Returns a valid `#RRGGBB` collection accent, or null when unset/invalid
 * (list UI falls back to muted theme tokens).
 */
export function resolveCollectionColor(
    color?: string | null,
): string | null {
    const trimmed = color?.trim();

    if (!trimmed || !COLLECTION_COLOR_HEX.test(trimmed)) {
        return null;
    }

    return trimmed;
}

export type CollectionRow = {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    status?: CollectionStatus;
    icon?: string | null;
    color?: string | null;
    is_singleton: boolean;
    versioning?: boolean;
    /** null = unlimited */
    revision_retention_count?: number | null;
    /** null = unlimited */
    revision_retention_days?: number | null;
    sort_order: number;
    deleted_at?: string | null;
};

/** Field definition row attached to a collection schema. */
export type CollectionFieldRow = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    sort_order: number;
    settings?: Record<string, unknown> | null;
};

/** Collection as returned for collection UI (list/show/fields), including field definitions. */
export type CollectionView = {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    status?: CollectionStatus;
    icon?: string | null;
    color?: string | null;
    is_singleton: boolean;
    versioning?: boolean;
    /** null = unlimited */
    revision_retention_count?: number | null;
    /** null = unlimited */
    revision_retention_days?: number | null;
    sort_order: number;
    form_layout?: Record<string, unknown> | null;
    fields: CollectionFieldRow[];
};

/**
 * Strips embedded fields from a {@link CollectionView} for collection metadata forms.
 *
 * @param collection - Full collection view from the server
 * @returns Row suitable for create/edit collection drawer state
 */
export function collectionToFormRow(collection: CollectionView): CollectionRow {
    return {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        description: collection.description ?? null,
        status: collection.status ?? 'active',
        icon: collection.icon ?? null,
        color: collection.color ?? null,
        is_singleton: collection.is_singleton,
        versioning: Boolean(collection.versioning),
        revision_retention_count: collection.revision_retention_count ?? null,
        revision_retention_days: collection.revision_retention_days ?? null,
        sort_order: collection.sort_order,
    };
}

/** Minimal item row for relation/M2A pickers (id + display label). */
export type ItemPickerRow = {
    id: number;
    label: string;
};
