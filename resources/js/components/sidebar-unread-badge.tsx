import { formatChatUnread } from '@/lib/format-chat-unread';
import { cn } from '@/lib/utils';

type SidebarUnreadBadgeProps = {
    count: number;
    className?: string;
    'data-test'?: string;
};

/**
 * Red unread count pill for sidebar nav items (chat, notifications).
 */
export function SidebarUnreadBadge({
    count,
    className,
    'data-test': dataTest,
}: SidebarUnreadBadgeProps) {
    if (count <= 0) {
        return null;
    }

    return (
        <span
            data-test={dataTest}
            className={cn(
                'absolute top-1/2 right-2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-xs leading-none font-semibold text-white tabular-nums',
                'group-data-[collapsible=icon]:right-1',
                className,
            )}
        >
            {formatChatUnread(count)}
        </span>
    );
}
