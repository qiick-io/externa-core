import type { ChatSummary } from '@/lib/chat-hub-api';

/** Shared list/header identity (title + avatars), without preview/unread. */
export type ChatThreadIdentity = Pick<
    ChatSummary,
    | 'id'
    | 'kind'
    | 'title'
    | 'collection_id'
    | 'collection_name'
    | 'collection_icon'
    | 'collection_color'
    | 'participants'
>;

/** Max faces in a stack before the last slot becomes +N. */
export const CHAT_AVATAR_MAX_VISIBLE = 3;

export type ChatParticipantRef = ChatSummary['participants'][number];

/**
 * Other people in a direct thread (viewer stripped). Groups are ignored —
 * expanded members already land as `type: 'user'` rows.
 */
export function otherUserFaces(
    participants: ChatParticipantRef[],
    viewerId: number,
): ChatParticipantRef[] {
    return participants.filter(
        (row) => row.type === 'user' && row.id !== viewerId,
    );
}

/**
 * @mentions: item chats always; direct only when not 1:1
 * (2+ other users, or a group participant).
 */
export function chatMentionsEnabled(
    kind: 'item' | 'direct',
    participants: ChatParticipantRef[],
    viewerId: number,
): boolean {
    if (kind === 'item') {
        return true;
    }

    if (participants.some((row) => row.type === 'group')) {
        return true;
    }

    return otherUserFaces(participants, viewerId).length > 1;
}

/**
 * How many face slots to render vs the +N overflow badge.
 * When `total > maxVisible`, last slot is reserved for +N so
 * `overflow = total - (maxVisible - 1)`.
 */
export function chatAvatarStackPlan(
    total: number,
    maxVisible = CHAT_AVATAR_MAX_VISIBLE,
): { shown: number; overflow: number } {
    if (total <= 0) {
        return { shown: 0, overflow: 0 };
    }

    if (total <= maxVisible) {
        return { shown: total, overflow: 0 };
    }

    const shown = maxVisible - 1;

    return { shown, overflow: total - shown };
}

export function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/);

    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function firstString(value: unknown): string {
    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const first = Object.values(value as Record<string, unknown>).find(
            (entry) => typeof entry === 'string' && entry.trim() !== '',
        );

        if (typeof first === 'string') {
            return first.trim();
        }
    }

    return '';
}

/** Same shape as PHP `ChatService::titleFor` for item threads. */
export function itemChatTitle(
    collectionName: string,
    itemLabel: string,
): string {
    return itemLabel !== ''
        ? `${collectionName} · ${itemLabel}`
        : collectionName;
}

export function itemLabelFromData(
    data: Record<string, unknown>,
    itemId: number,
): string {
    for (const key of ['title', 'name', 'label', 'heading']) {
        const text = firstString(data[key]);

        if (text !== '') {
            return text;
        }
    }

    return `#${itemId}`;
}
