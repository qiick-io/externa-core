import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useOnlineUsers } from '@/hooks/use-online-users';
import { avatarToneClass } from '@/lib/avatar-tone';
import { initialsFromName } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The user a card describes; `name` is the display name (same shape as the registry item). */
export type UserHoverCardUser = {
    id: number | string;
    name: string;
    email?: string;
    avatar?: string | null;
    /** Role label shown as a badge (already translated). */
    role?: string | null;
};

type UserHoverCardProps = {
    user: UserHoverCardUser;
    /**
     * Presence. Omit it to let the card read the realtime presence itself,
     * only while it is open (externa-core always has presence).
     */
    isOnline?: boolean;
    /** The trigger: an author name or a mention. */
    children: ReactNode;
};

/**
 * A chat participant's card on hover or focus, on shadcn `HoverCard`: avatar,
 * name, role and whether they are online. Wraps author names and mentions
 * (`ChatMention`). Same API as the registry `UserHoverCard`.
 */
export function UserHoverCard({
    user,
    isOnline,
    children,
}: UserHoverCardProps) {
    return (
        <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent
                align="start"
                className="w-64"
                data-test="chat-user-hover-card"
            >
                {isOnline === undefined ? (
                    <UserCardWithPresence user={user} />
                ) : (
                    <UserCard user={user} isOnline={isOnline} />
                )}
            </HoverCardContent>
        </HoverCard>
    );
}

/** Reads presence on demand: the card body only mounts while it is open. */
function UserCardWithPresence({ user }: { user: UserHoverCardUser }) {
    const onlineUsers = useOnlineUsers();

    return (
        <UserCard
            user={user}
            isOnline={typeof user.id === 'number' && onlineUsers.has(user.id)}
        />
    );
}

function UserCard({
    user,
    isOnline,
}: {
    user: UserHoverCardUser;
    isOnline: boolean;
}) {
    const { t } = useTranslation();

    return (
        <div className="flex items-center gap-3">
            <Avatar className="size-10">
                {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                <AvatarFallback className={avatarToneClass(user.id)}>
                    {initialsFromName(user.name)}
                </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium">
                    {user.name}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                    {user.role ? (
                        <Badge variant="secondary">{user.role}</Badge>
                    ) : null}
                    <span
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        data-test="chat-user-presence"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                'size-2 rounded-full',
                                isOnline
                                    ? 'bg-success'
                                    : 'bg-muted-foreground/40',
                            )}
                        />
                        {isOnline ? t('common.online') : t('common.offline')}
                    </span>
                </div>
            </div>
        </div>
    );
}
