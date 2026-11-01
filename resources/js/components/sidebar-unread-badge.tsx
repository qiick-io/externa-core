import { useTranslation } from 'react-i18next';
import { formatChatUnread } from '@/lib/format-chat-unread';
import { cn } from '@/lib/utils';

type SidebarUnreadBadgeProps = {
    count: number;
    className?: string;
    'data-test'?: string;
    /**
     * When true, the badge is decorative (parent already announces the count).
     * Default: meaningful status with an accessible unread label.
     */
    decorative?: boolean;
};

/**
 * Red unread count pill for sidebar nav items (chat, notifications).
 */
export function SidebarUnreadBadge({
    count,
    className,
    'data-test': dataTest,
    decorative = false,
}: SidebarUnreadBadgeProps) {
    const { t } = useTranslation();

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
            {...(decorative
                ? { 'aria-hidden': true as const }
                : {
                      role: 'status' as const,
                      'aria-label': t('a11y.unreadCount', { count }),
                  })}
        >
            {formatChatUnread(count)}
        </span>
    );
}
