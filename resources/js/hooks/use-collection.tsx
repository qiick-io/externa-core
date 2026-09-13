import { usePage } from '@inertiajs/react';
import { useMemo } from 'react';
import collections from '@/routes/collections';
import type { BreadcrumbItem } from '@/types';
import type { CollectionView } from '@/types/collections';

export type UseCollectionInput = {
    collection: CollectionView;
    singletonRawData: Record<string, unknown> | null;
    editableRawData: Record<string, unknown> | null;
};

/**
 * Derives locales, breadcrumbs, and default field values for collection item editing.
 * Does not manage field schema — only item content context.
 *
 * @param input - Collection metadata and raw item data from the server
 * @returns Locales, breadcrumbs, content defaults, and whether fields exist
 */
export function useCollection({
    collection,
    singletonRawData,
    editableRawData,
}: UseCollectionInput): {
    locales: string[];
    breadcrumbs: BreadcrumbItem[];
    contentDefaults: Record<string, unknown>;
    hasFields: boolean;
} {
    const { collectionLocales } = usePage().props;
    const locales = (collectionLocales as string[]) ?? ['en'];

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Collections', href: collections.index.url() },
            {
                title: collection.name,
                href: collection.is_singleton
                    ? collections.show.url(collection.id)
                    : collections.items.index.url(collection.id),
            },
        ],
        [collection.id, collection.name, collection.is_singleton],
    );

    const contentDefaults = collection.is_singleton
        ? (singletonRawData ?? {})
        : (editableRawData ?? {});

    const hasFields = collection.fields.length > 0;

    return {
        locales,
        breadcrumbs,
        contentDefaults,
        hasFields,
    };
}
