import { useTranslation } from 'react-i18next';
import {
    Avatar,
    AvatarBadge,
    AvatarFallback,
    AvatarImage,
} from '@/components/ui/avatar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { avatarToneClass } from '@/lib/avatar-tone';
import { formatUserDisplayName, initialsFromName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminUserRow } from '@/types/admin';

type UserAvatarProps = {
    user: Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'> & {
        avatar?: string | null;
    };
    /** Presence: green online / grey offline badge. Omit for no badge. */
    isOnline?: boolean;
    size?: 'default' | 'sm' | 'lg';
    className?: string;
};

/**
 * Admin-list user avatar: the picture, else per-user colour initials, with an
 * optional presence `AvatarBadge` (bottom-right). Decorative: the row text
 * already names the user. Works as a child of `AvatarGroup`.
 */
export function UserAvatar({
    user,
    isOnline,
    size = 'default',
    className,
}: UserAvatarProps) {
    const { t } = useTranslation();
    const displayName = formatUserDisplayName(user.first_name, user.last_name);
    const initials =
        displayName !== ''
            ? initialsFromName(displayName)
            : user.email.charAt(0).toUpperCase();

    return (
        <Avatar size={size} className={className}>
            {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
            <AvatarFallback
                className={cn(avatarToneClass(user.id), 'text-xs font-medium')}
            >
                {initials}
            </AvatarFallback>
            {isOnline === undefined ? null : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <AvatarBadge
                            // TooltipTrigger asChild would otherwise replace the slot.
                            data-slot="avatar-badge"
                            className={
                                isOnline ? 'bg-success' : 'bg-muted-foreground'
                            }
                            data-test="user-online-dot"
                            data-online={isOnline ? '1' : '0'}
                            aria-hidden
                        />
                    </TooltipTrigger>
                    <TooltipContent>
                        {isOnline ? t('common.online') : t('common.offline')}
                    </TooltipContent>
                </Tooltip>
            )}
        </Avatar>
    );
}
