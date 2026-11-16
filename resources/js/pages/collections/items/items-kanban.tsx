import { Columns3 } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { buildItemListQuery } from '@/lib/item-list-views';
import type { CollectionView } from '@/types';
import { KanbanColumn } from './kanban-column';
import { useKanbanColumnPaging } from './use-kanban-column-paging';
import { useKanbanColumns } from './use-kanban-columns';
import type { KanbanBoard } from './use-kanban-columns';
import { useKanbanDrag } from './use-kanban-drag';

export type { KanbanBoard, KanbanColumnPage } from './use-kanban-columns';

/**
 * Kanban board with per-column pagination. Drag updates via item PUT.
 */
export function ItemsKanban({
    collection,
    board,
    filters,
    canEdit,
    isTrashed,
}: {
    collection: CollectionView;
    board: KanbanBoard | null;
    filters: Record<string, unknown>;
    canEdit: boolean;
    isTrashed: boolean;
}) {
    const { t } = useTranslation();
    const boardRef = useRef<HTMLDivElement | null>(null);
    const versioningEnabled = Boolean(collection.versioning);
    const approvalsRequired = Boolean(collection.approvals_required);
    const fieldName = board?.field ?? null;
    const perPage = board?.per_page ?? 30;

    const listQuery = useMemo(() => buildItemListQuery(filters), [filters]);

    const {
        columns,
        setColumns,
        columnsRef,
        sortableEpoch,
        bumpSortableEpoch,
        loadMore,
    } = useKanbanColumns({
        board,
        collectionId: collection.id,
        fieldName,
        perPage,
        listQuery,
    });

    // Remount Sortable when column set / edit mode changes — not on every card move.
    const columnLayoutKey = columns.map((column) => column.value).join('|');

    useKanbanDrag({
        boardRef,
        collectionId: collection.id,
        collectionVersioning: collection.versioning,
        canEdit,
        isTrashed,
        fieldName,
        columnsRef,
        setColumns,
        bumpSortableEpoch,
        columnLayoutKey,
        sortableEpoch,
    });

    useKanbanColumnPaging({
        boardRef,
        loadMore,
        columnLayoutKey,
        sortableEpoch,
    });

    if (!board || !fieldName) {
        return (
            <Empty
                className="gap-3 border border-dashed p-6 md:p-6"
                data-test="kanban-missing-field"
            >
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-primary/10 text-primary"
                    >
                        <Columns3 />
                    </EmptyMedia>
                    <EmptyDescription>
                        {t('collections.itemsList.kanbanMissingField')}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <div
            ref={boardRef}
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden"
            data-test="items-kanban"
            data-kanban-per-page={perPage}
        >
            {columns.map((column) => (
                <KanbanColumn
                    key={column.value || '__empty'}
                    column={column}
                    collectionId={collection.id}
                    canEdit={canEdit}
                    isTrashed={isTrashed}
                    versioningEnabled={versioningEnabled}
                    approvalsRequired={approvalsRequired}
                    onLoadMore={loadMore}
                />
            ))}
        </div>
    );
}
