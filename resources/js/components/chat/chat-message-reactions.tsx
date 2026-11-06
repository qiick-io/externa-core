import { useTranslation } from 'react-i18next';
import {
    Avatar,
    AvatarFallback,
    AvatarGroup,
    AvatarGroupCount,
} from '@/components/ui/avatar';
import { BubbleReactions } from '@/components/ui/bubble';
import { initialsFromName } from '@/lib/format';
import type { ChatReaction } from '@/lib/item-chat-api';

const MAX_FACES = 3;

type ChatMessageReactionsProps = {
    reactions: ChatReaction[];
    align: 'start' | 'end';
    onToggle: (emoji: string) => void;
};

/**
 * Reactions under a chat bubble, on shadcn `BubbleReactions`: one toggle per
 * emoji with the faces of who reacted (`AvatarGroup`, `AvatarGroupCount` past
 * three). Render it inside the `Bubble`.
 */
export function ChatMessageReactions({
    reactions,
    align,
    onToggle,
}: ChatMessageReactionsProps) {
    const { t } = useTranslation();

    if (reactions.length === 0) {
        return null;
    }

    return (
        <BubbleReactions align={align} data-test="chat-message-reactions">
            {reactions.map((reaction) => {
                const users = reaction.users ?? [];
                const names = users.map((user) => user.name).join(', ');

                return (
                    <button
                        key={reaction.emoji}
                        type="button"
                        title={names}
                        aria-pressed={reaction.reacted}
                        aria-label={t('collections.itemChat.reactionToggle', {
                            emoji: reaction.emoji,
                            names,
                        })}
                        className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs leading-none hover:bg-accent aria-pressed:bg-primary/15"
                        onClick={() => onToggle(reaction.emoji)}
                    >
                        <span aria-hidden>{reaction.emoji}</span>
                        <AvatarGroup className="-space-x-1" aria-hidden>
                            {users.slice(0, MAX_FACES).map((user) => (
                                <Avatar
                                    key={user.id}
                                    userId={user.id}
                                    className="size-4 ring-1!"
                                >
                                    <AvatarFallback className="text-xs">
                                        {initialsFromName(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                            ))}
                            {users.length > MAX_FACES ? (
                                <AvatarGroupCount className="size-4 text-xs ring-1">
                                    +{users.length - MAX_FACES}
                                </AvatarGroupCount>
                            ) : null}
                        </AvatarGroup>
                    </button>
                );
            })}
        </BubbleReactions>
    );
}
