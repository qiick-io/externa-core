import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { ChatMention } from '@/components/chat/chat-mention';
import { formatDateTime } from '@/lib/format';
import type {
    ChatAttachment,
    ChatCollection,
    ChatUser,
} from '@/lib/item-chat-api';

/**
 * Formatting helpers and constants shared by the item chat drawer and its parts:
 * stored message bodies with `@[user:id]` / `@[collection:id]` tokens, day and time
 * labels, and the composer's emoji grid.
 */

export const EMOJI_GRID = [
    '😀',
    '😃',
    '😄',
    '😁',
    '😅',
    '😂',
    '😊',
    '🙂',
    '😉',
    '😍',
    '😘',
    '😜',
    '🤔',
    '😎',
    '😢',
    '😭',
    '😡',
    '👍',
    '👎',
    '👏',
    '🙏',
    '🔥',
    '✨',
    '🎉',
    '❤️',
    '💯',
    '✅',
    '❌',
    '📌',
    '📎',
    '💡',
    '👀',
    '🙌',
    '💪',
    '🤝',
    '⭐',
    '🚀',
    '💬',
];

/** One row of the `@` mention menu: a user or a collection. */
export type MentionHit =
    | { type: 'user'; id: number; name: string; email?: string }
    | { type: 'collection'; id: number; name: string };

/**
 * Render a stored body, turning mention tokens into user mentions and collection links.
 */
export function renderMessageBody(
    body: string,
    mentions: ChatUser[],
    collections: ChatCollection[] = [],
): ReactNode {
    const users = new Map(mentions.map((user) => [user.id, user]));
    const collectionNames = new Map(
        collections.map((collection) => [collection.id, collection.name]),
    );
    const nodes: ReactNode[] = [];
    let last = 0;
    const re = /@\[(user|collection):(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(body)) !== null) {
        if (match.index > last) {
            nodes.push(body.slice(last, match.index));
        }

        const kind = match[1];
        const id = Number(match[2]);

        if (kind === 'collection') {
            nodes.push(
                <Link
                    key={`${match.index}-c-${id}`}
                    href={`/collections/${id}`}
                    className="rounded bg-primary/15 px-1 font-medium underline-offset-2 hover:underline"
                >
                    @{collectionNames.get(id) ?? `collection ${id}`}
                </Link>,
            );
        } else {
            nodes.push(
                <ChatMention
                    key={`${match.index}-${id}`}
                    user={users.get(id)}
                    fallbackLabel={`@user ${id}`}
                />,
            );
        }

        last = match.index + match[0].length;
    }

    if (last < body.length) {
        nodes.push(body.slice(last));
    }

    return nodes.length > 0 ? nodes : body;
}

/** Day label of a message timestamp, used for day separators and grouping. */
export function dayLabel(iso: string | null): string {
    if (!iso) {
        return '';
    }

    return formatDateTime(iso, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/** Hour and minute of a message timestamp, shown inside the bubble. */
export function commentTime(iso: string | null): string {
    if (!iso) {
        return '';
    }

    return formatDateTime(iso, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Images and videos render in the media album; everything else as a file row. */
export function isChatMediaAttachment(attachment: ChatAttachment): boolean {
    return (
        attachment.mime.startsWith('image/') ||
        attachment.mime.startsWith('video/')
    );
}
