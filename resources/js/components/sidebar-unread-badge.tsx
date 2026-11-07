import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { SidebarMenuBadge } from '@/components/ui/sidebar';
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
 * Unread count pill for sidebar nav items (chat, notifications).
 * Uses shadcn SidebarMenuBadge + Badge; keep as a sibling of SidebarMenuButton.
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
        <SidebarMenuBadge
            data-test={dataTest}
            className={cn(
                'top-1/2 right-2 -translate-y-1/2 p-0 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:flex',
                className,
            )}
            {...(decorative
                ? { 'aria-hidden': true as const }
                : {
                      role: 'status' as const,
                      'aria-label': t('a11y.unreadCount', { count }),
                  })}
        >
            <Badge
                variant="destructive"
                className="h-5 min-w-5 rounded-full px-1 text-xs leading-none font-semibold tabular-nums"
            >
                {formatChatUnread(count)}
            </Badge>
        </SidebarMenuBadge>
    );
}
