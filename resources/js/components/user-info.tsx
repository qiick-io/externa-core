import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatUserDisplayName, useInitials } from '@/hooks/use-initials';
import type { User } from '@/types';

/**
 * Avatar plus display name (and optional email) for the authenticated user.
 * @param {{ user: User, showEmail?: boolean }} props - Component props.
 * @param {User} props.user - User record with name, avatar, and email.
 * @param {boolean} [props.showEmail=false] - Whether to show the email line.
 * @returns {JSX.Element}
 */
export function UserInfo({
    user,
    showEmail = false,
}: {
    user: User;
    showEmail?: boolean;
}) {
    const getInitials = useInitials();
    const displayName = formatUserDisplayName(user.first_name, user.last_name);

    return (
        <>
            <Avatar className="h-8 w-8 overflow-hidden rounded-full">
                <AvatarImage src={user.avatar} alt={displayName} />
                <AvatarFallback className="rounded-lg bg-neutral-200 text-black dark:bg-neutral-700 dark:text-white">
                    {getInitials(user.first_name, user.last_name)}
                </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                {showEmail && (
                    <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </span>
                )}
            </div>
        </>
    );
}
