/** Collection row as stored in list/admin tables (without embedded fields). */
export type CollectionRow = {
    id: number;
    name: string;
    slug: string;
    is_singleton: boolean;
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
    is_singleton: boolean;
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
        is_singleton: collection.is_singleton,
        sort_order: collection.sort_order,
    };
}

/** Minimal item row for relation/M2A pickers (id + display label). */
export type ItemPickerRow = {
    id: number;
    label: string;
};
