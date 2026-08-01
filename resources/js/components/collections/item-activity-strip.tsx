import { Link } from '@inertiajs/react';
import { History, ScrollText } from 'lucide-react';
import adminRoutes from '@/lib/admin-routes';

type ActivityEntry = {
    id: number;
    description: string;
    event: string | null;
    created_at: string | null;
    causer: string | null;
};

type ItemActivityStripProps = {
    collectionId: number;
    itemId: number;
    updatedAt?: string | null;
    userUpdatedName?: string | null;
    recentActivity?: ActivityEntry[];
};

/**
 * Header strip: last update + links to revisions / filtered activity.
 */
export function ItemActivityStrip({
    collectionId,
    itemId,
    updatedAt,
    userUpdatedName,
    recentActivity = [],
}: ItemActivityStripProps) {
    const activityHref = adminRoutes.activityLogs.index({
        query: {
            subject_type: 'App\\Models\\CollectionItem',
            subject_id: itemId,
        },
    });

    const updatedLabel = updatedAt
        ? new Date(updatedAt).toLocaleString()
        : null;

    return (
        <div
            className="flex flex-col gap-2 rounded-lg border border-sidebar-border/70 bg-muted/30 px-3 py-2 text-sm dark:border-sidebar-border"
            data-test="item-activity-strip"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span>
                    Last updated
                    {userUpdatedName ? (
                        <>
                            {' '}
                            by{' '}
                            <span className="text-foreground">
                                {userUpdatedName}
                            </span>
                        </>
                    ) : null}
                    {updatedLabel ? (
                        <>
                            {' '}
                            at{' '}
                            <span className="text-foreground">
                                {updatedLabel}
                            </span>
                        </>
                    ) : (
                        ' —'
                    )}
                </span>
                <span className="hidden text-border sm:inline">·</span>
                <Link
                    href={`/collections/${collectionId}/items/${itemId}/revisions`}
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                    <History className="size-3.5" />
                    Revisions
                </Link>
                <Link
                    href={activityHref}
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                    <ScrollText className="size-3.5" />
                    Activity
                </Link>
            </div>
            {recentActivity.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {recentActivity.map((entry) => (
                        <li key={entry.id}>
                            {entry.event ?? entry.description}
                            {entry.causer ? ` · ${entry.causer}` : ''}
                            {entry.created_at
                                ? ` · ${new Date(entry.created_at).toLocaleString()}`
                                : ''}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
