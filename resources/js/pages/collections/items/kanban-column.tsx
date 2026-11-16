import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { KanbanCard } from './kanban-card';
import type { ColumnState } from './use-kanban-columns';

type KanbanColumnProps = {
    column: ColumnState;
    collectionId: number;
    canEdit: boolean;
    isTrashed: boolean;
    versioningEnabled: boolean;
    approvalsRequired: boolean;
    /** Fetches the column's next page; a no-op when there is none left. */
    onLoadMore: (columnValue: string) => Promise<void>;
};

/**
 * One kanban column: its label and total, its cards, the sentinel the column
 * paging observer watches, and the load-more button while pages remain.
 */
export function KanbanColumn({
    column,
    collectionId,
    canEdit,
    isTrashed,
    versioningEnabled,
    approvalsRequired,
    onLoadMore,
}: KanbanColumnProps) {
    const { t } = useTranslation();
    const hasMore = column.current_page < column.last_page;

    return (
        <section
            className="flex min-h-0 min-w-[18.75rem] flex-1 shrink-0 flex-col rounded-lg border bg-muted/20 sm:min-w-[20rem]"
            data-test={`kanban-column-${column.value || 'empty'}`}
        >
            <header className="shrink-0 border-b px-3 py-2 text-sm font-medium">
                {column.label}
                <span
                    className="ml-2 text-xs text-muted-foreground"
                    data-test={`kanban-column-count-${column.value || 'empty'}`}
                >
                    {column.total}
                </span>
            </header>
            <ul
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
                data-kanban-column
                data-column-value={column.value}
            >
                {column.items.map((item) => (
                    <KanbanCard
                        key={item.id}
                        item={item}
                        collectionId={collectionId}
                        canEdit={canEdit}
                        isTrashed={isTrashed}
                        versioningEnabled={versioningEnabled}
                        approvalsRequired={approvalsRequired}
                    />
                ))}
                {hasMore ? (
                    <li
                        className="list-none"
                        data-kanban-sentinel
                        data-column-value={column.value}
                        aria-hidden
                    />
                ) : null}
            </ul>
            {hasMore ? (
                <div className="shrink-0 border-t p-2">
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        disabled={column.loading}
                        data-test={`kanban-load-more-${column.value || 'empty'}`}
                        onClick={() => void onLoadMore(column.value)}
                    >
                        {column.loading ? (
                            <>
                                <Spinner className="size-3.5" />
                                {t('collections.itemsList.kanbanLoading')}
                            </>
                        ) : (
                            t('collections.itemsList.kanbanLoadMore')
                        )}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
