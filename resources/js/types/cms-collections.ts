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

export type CmsCollection = {
    id: number;
    name: string;
    slug: string;
    is_singleton: boolean;
    sort_order: number;
    fields: CollectionFieldRow[];
};

export function cmsCollectionToFormRow(collection: CmsCollection): CollectionRow {
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
