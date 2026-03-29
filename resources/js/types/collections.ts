export type CollectionRow = {
    id: number;
    name: string;
    slug: string;
    is_singleton: boolean;
    sort_order: number;
};

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
    fields: CollectionFieldRow[];
};

export function collectionToFormRow(collection: CollectionView): CollectionRow {
    return {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        is_singleton: collection.is_singleton,
        sort_order: collection.sort_order,
    };
}

export type ItemPickerRow = {
    id: number;
    label: string;
};
