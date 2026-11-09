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
import type { ChatUser } from '@/lib/item-chat-api';
import { cn } from '@/lib/utils';

type UserHoverCardProps = {
    user: ChatUser;
    /** The trigger: an author name or a mention. */
    children: ReactNode;
};

/**
 * A chat participant's card on hover or focus, on shadcn `HoverCard`: avatar,
 * name, role and whether they are online. Wraps author names and mentions.
 */
export function UserHoverCard({ user, children }: UserHoverCardProps) {
    return (
        <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent
                align="start"
                className="w-64"
                data-test="chat-user-hover-card"
            >
                <ChatUserCard user={user} />
            </HoverCardContent>
        </HoverCard>
    );
}

/** The card body; mounted only while open, so presence is read on demand. */
function ChatUserCard({ user }: { user: ChatUser }) {
    const { t } = useTranslation();
    const online = useOnlineUsers().has(user.id);

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
                                online
                                    ? 'bg-success'
                                    : 'bg-muted-foreground/40',
                            )}
                        />
                        {online ? t('common.online') : t('common.offline')}
                    </span>
                </div>
            </div>
        </div>
    );
}
