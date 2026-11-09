import { Badge } from '@/components/ui/badge';
import { UserHoverCard } from '@/components/user-hover-card';
import type { UserHoverCardUser } from '@/components/user-hover-card';

type ChatMentionProps = {
    /** The mentioned user; without one (deleted, unknown) the mention is plain text. */
    user?: UserHoverCardUser;
    /** Text when the user is unknown ("@user 12"). Defaults to `@` + the user's name. */
    fallbackLabel?: string;
    /** Presence for the hover card. */
    isOnline?: boolean;
};

/**
 * An `@mention` inside a chat message, as externa-core renders it: a
 * secondary `Badge` tinted with the primary colour, opening the user's
 * `UserHoverCard` on hover or focus. The app parses its own mention tokens
 * and renders one per mention.
 */
export function ChatMention({
    user,
    fallbackLabel,
    isOnline,
}: ChatMentionProps) {
    const text = user ? `@${user.name}` : (fallbackLabel ?? '@?');

    if (!user) {
        return (
            <Badge
                variant="secondary"
                className="bg-primary/15 px-1 align-baseline text-sm text-foreground"
                data-test="chat-mention"
            >
                {text}
            </Badge>
        );
    }

    return (
        <UserHoverCard user={user} isOnline={isOnline}>
            <Badge
                variant="secondary"
                className="cursor-default bg-primary/15 px-1 align-baseline text-sm text-foreground"
                data-test="chat-mention"
                asChild
            >
                <button type="button">{text}</button>
            </Badge>
        </UserHoverCard>
    );
}
