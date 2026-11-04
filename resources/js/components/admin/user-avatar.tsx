import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitialsFromParts } from '@/hooks/use-initials';
import { cn } from '@/lib/utils';
import type { AdminUserRow } from '@/types/admin';

type UserAvatarProps = {
    user: Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>;
    isOnline: boolean;
    className?: string;
};

/**
 * Admin-list user avatar: per-user colour initials with an online / offline dot
 * (Users list and the Groups members column share it). Decorative: the row text
 * already names the user.
 */
export function UserAvatar({ user, isOnline, className }: UserAvatarProps) {
    const { t } = useTranslation();
    const initials =
        getInitialsFromParts(user.first_name, user.last_name) ||
        user.email.charAt(0).toUpperCase();

    return (
        <span className={cn('relative shrink-0', className)}>
            <Avatar userId={user.id} className="size-7">
                <AvatarFallback className="text-xs font-medium">
                    {initials}
                </AvatarFallback>
            </Avatar>
            <span
                className={cn(
                    'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background',
                    isOnline ? 'bg-success' : 'bg-muted-foreground/30',
                )}
                title={isOnline ? t('common.online') : t('common.offline')}
                data-test="user-online-dot"
                data-online={isOnline ? '1' : '0'}
                aria-hidden
            />
        </span>
    );
}
