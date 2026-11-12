import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import filesRoutes from '@/routes/files';
import type { BreadcrumbItem } from '@/types';
import type { FileBreadcrumb } from '@/types/files';

export type FileSortField = 'name' | 'size' | 'created_at' | 'updated_at';
export type FileSortDirection = 'asc' | 'desc';
export type FilesTrashedView = 'active' | 'trashed';

export type FileFilters = {
    trashed?: 'only' | 'with' | null;
    tag_ids?: number[];
    sort?: FileSortField;
    direction?: FileSortDirection;
};

/**
 * Owns the file manager's URL-backed list filters (trash view, tag filter, sort)
 * and builds the Wayfinder URLs and breadcrumbs that carry them.
 *
 * Local state mirrors the server `filters` prop so the toolbar reacts at once
 * while the Inertia visit is in flight; the effects re-sync it when props land.
 */
export function useFilesFilters(
    filters: FileFilters,
    parentId: number | null,
    initialBreadcrumbs: FileBreadcrumb[],
) {
    const { t } = useTranslation();
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
        filters.tag_ids ?? [],
    );
    const [trashed, setTrashed] = useState<FilesTrashedView>(
        filters.trashed === 'only' ? 'trashed' : 'active',
    );
    const [sort, setSort] = useState<FileSortField>(filters.sort ?? 'name');
    const [direction, setDirection] = useState<FileSortDirection>(
        filters.direction ?? 'asc',
    );
    const isTrashed = trashed === 'trashed';

    useEffect(() => {
        // oxlint-disable-next-line react/set-state-in-effect -- moved as is from pages/admin/files/index.tsx (#283), where the compiler skipped it; moving the sync out of the effect changes render timing
        setSelectedTagIds(filters.tag_ids ?? []);
    }, [filters.tag_ids]);

    useEffect(() => {
        // oxlint-disable-next-line react/set-state-in-effect -- moved as is from pages/admin/files/index.tsx (#283), where the compiler skipped it; moving the sync out of the effect changes render timing
        setSort(filters.sort ?? 'name');
        setDirection(filters.direction ?? 'asc');
    }, [filters.sort, filters.direction]);

    const pageBreadcrumbs: BreadcrumbItem[] = useMemo(() => {
        const listQuery: Record<string, string | number | number[]> = {
            sort,
            direction,
        };

        if (selectedTagIds.length > 0) {
            listQuery.tag_ids = selectedTagIds;
        }

        const crumbs: BreadcrumbItem[] = [
            {
                title: t('files.title'),
                href: filesRoutes.index.url(undefined, { query: listQuery }),
            },
        ];

        if (!isTrashed) {
            for (const crumb of initialBreadcrumbs) {
                crumbs.push({
                    title: crumb.name,
                    href: filesRoutes.index.url(crumb.id, {
                        query: listQuery,
                    }),
                });
            }
        }

        return crumbs;
    }, [direction, initialBreadcrumbs, isTrashed, selectedTagIds, sort, t]);

    const buildFilesIndexUrl = useCallback(
        (
            options: {
                folderId?: number | null;
                nextTrashed?: FilesTrashedView;
                nextTagIds?: number[];
                nextSort?: FileSortField;
                nextDirection?: FileSortDirection;
            } = {},
        ): string => {
            const folderId =
                options.folderId !== undefined ? options.folderId : parentId;
            const nextTrashed = options.nextTrashed ?? trashed;
            const nextTagIds = options.nextTagIds ?? selectedTagIds;
            const nextSort = options.nextSort ?? sort;
            const nextDirection = options.nextDirection ?? direction;
            const query: Record<
                string,
                string | number | number[] | undefined
            > = {
                trashed: nextTrashed === 'trashed' ? 'only' : undefined,
                tag_ids: nextTagIds.length > 0 ? nextTagIds : undefined,
                sort: nextSort,
                direction: nextDirection,
            };

            if (nextTrashed === 'trashed' || folderId === null) {
                return filesRoutes.index.url(undefined, { query });
            }

            return filesRoutes.index.url(folderId, { query });
        },
        [direction, parentId, selectedTagIds, sort, trashed],
    );

    return {
        trashed,
        setTrashed,
        isTrashed,
        selectedTagIds,
        setSelectedTagIds,
        sort,
        setSort,
        direction,
        setDirection,
        pageBreadcrumbs,
        buildFilesIndexUrl,
    };
}
