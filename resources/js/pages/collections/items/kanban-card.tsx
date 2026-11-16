import { Link } from '@inertiajs/react';
import type { TFunction } from 'i18next';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { itemRowTitle } from '@/lib/item-list-views';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type { ItemRow } from '@/types';

/** Localized short date of the item's last update, null when there is none. */
function formatUpdatedAt(value: string | null | undefined): string | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/** Translated approval badge label; unknown server values show as they are. */
function approvalLabel(status: string, t: TFunction): string {
    if (status === 'in_review') {
        return t('collections.itemToolbar.inReview');
    }

    if (status === 'approved') {
        return t('collections.itemToolbar.approved');
    }

    if (status === 'rejected') {
        return t('collections.itemToolbar.rejected');
    }

    return status;
}

type KanbanCardProps = {
    item: ItemRow;
    collectionId: number;
    canEdit: boolean;
    isTrashed: boolean;
    /** Collection versioning: shows the draft badge on a published card. */
    versioningEnabled: boolean;
    /** Collection approvals: shows the approval badge when the item has a status. */
    approvalsRequired: boolean;
};

/**
 * One item card of a kanban column: drag handle, linked title, id and update
 * date, plus the draft and approval badges.
 */
export function KanbanCard({
    item,
    collectionId,
    canEdit,
    isTrashed,
    versioningEnabled,
    approvalsRequired,
}: KanbanCardProps) {
    const { t } = useTranslation();
    const updated = formatUpdatedAt(item.updated_at);
    const showDraft = versioningEnabled && item.has_draft === true;
    const approvalStatus =
        typeof item.approval_status === 'string' ? item.approval_status : null;
    const showApproval =
        approvalsRequired &&
        approvalStatus !== null &&
        approvalStatus !== '' &&
        approvalStatus !== 'draft';

    return (
        <li
            data-kanban-card
            data-item-id={item.id}
            className="rounded-md border bg-background p-3 shadow-xs"
        >
            <div className="flex items-start gap-2">
                {canEdit && !isTrashed ? (
                    <button
                        type="button"
                        data-kanban-handle
                        className="mt-0.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                        aria-label={t('a11y.dragToReorder')}
                    >
                        <GripVertical className="size-3.5" />
                    </button>
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <Link
                            href={withReturnParam(
                                collections.items.show.url({
                                    collection: collectionId,
                                    item: item.id,
                                }),
                                currentPathWithQuery(),
                            )}
                            className="min-w-0 flex-1 text-sm leading-snug font-medium hover:underline"
                        >
                            {itemRowTitle(item)}
                        </Link>
                        {showDraft ? (
                            <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                                data-test={`kanban-draft-badge-${item.id}`}
                            >
                                {t('collections.itemToolbar.draft')}
                            </Badge>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">
                            #{item.id}
                        </span>
                        {updated ? (
                            <span>
                                {t('collections.items.kanban.updated', {
                                    date: updated,
                                })}
                            </span>
                        ) : null}
                    </div>
                    {showApproval && approvalStatus !== null ? (
                        <Badge
                            variant={
                                approvalStatus === 'rejected'
                                    ? 'destructive'
                                    : 'outline'
                            }
                            className="text-xs"
                            data-test={`kanban-approval-badge-${item.id}`}
                        >
                            {approvalLabel(approvalStatus, t)}
                        </Badge>
                    ) : null}
                </div>
            </div>
        </li>
    );
}
