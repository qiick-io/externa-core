import type { ChatSummary, ChatUnreadShare } from '@/lib/chat-hub-api';
import type { ChatPinned, ItemChatMessage } from '@/lib/item-chat-api';

export type CacheStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ThreadsCacheEntry = {
    items: ChatSummary[];
    loadedAt: number | null;
    status: CacheStatus;
};

export type MessagesCacheEntry = {
    messages: ItemChatMessage[];
    hasMore: boolean;
    pinned: ChatPinned[];
    fetchedAt: number | null;
    status: CacheStatus;
};

export const MESSAGES_CACHE_MAX = 20;

export function emptyUnread(): ChatUnreadShare {
    return {
        unread_count: 0,
        unread_private: 0,
        unread_collection: 0,
    };
}

export function isUnreadShare(value: unknown): value is ChatUnreadShare {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const row = value as ChatUnreadShare;

    return (
        typeof row.unread_count === 'number' &&
        typeof row.unread_private === 'number' &&
        typeof row.unread_collection === 'number'
    );
}

export function threadsCacheKey(
    tab: 'collection' | 'private',
    q: string,
): string {
    return `${tab}|${q}`;
}

/** Whether a ThreadUpserted row belongs in a filtered private cache key. */
export function threadMatchesPrivateQuery(
    thread: ChatSummary,
    q: string,
): boolean {
    const needle = q.trim().toLowerCase();

    if (needle === '') {
        return true;
    }

    const haystacks = [
        thread.title,
        thread.last_message?.body ?? '',
        ...thread.participants.map((row) => row.name),
    ];

    return haystacks.some((hay) => hay.toLowerCase().includes(needle));
}

/**
 * Prepend or merge+promote a thread in one private list (no flash / full replace).
 */
export function upsertThreadInList(
    items: ChatSummary[],
    thread: ChatSummary,
): ChatSummary[] {
    const index = items.findIndex((row) => row.id === thread.id);

    if (index < 0) {
        return [thread, ...items];
    }

    const next = items.slice();
    next.splice(index, 1);
    next.unshift({ ...items[index], ...thread });

    return next;
}

/** Keep first occurrence of each message id (stable order). */
export function dedupeMessagesById(
    messages: ItemChatMessage[],
): ItemChatMessage[] {
    const seen = new Set<number>();
    const out: ItemChatMessage[] = [];

    for (const row of messages) {
        if (seen.has(row.id)) {
            continue;
        }

        seen.add(row.id);
        out.push(row);
    }

    return out;
}

/** Append if id missing; no-op if already present (Echo + HTTP race). */
export function appendMessageDedupe(
    prev: ItemChatMessage[],
    next: ItemChatMessage,
): ItemChatMessage[] {
    if (prev.some((row) => row.id === next.id)) {
        return prev;
    }

    return [...prev, next];
}

export function prependOlderDedupe(
    prev: ItemChatMessage[],
    older: ItemChatMessage[],
): ItemChatMessage[] {
    const seen = new Set(prev.map((row) => row.id));
    const fresh = older.filter((row) => !seen.has(row.id));

    return [...fresh, ...prev];
}

/**
 * Soft-refresh latest page without wiping already-prepended older history.
 * Server page wins in the overlapping id window; keep local older/newer tails.
 */
export function mergeLatestPage(
    prev: ItemChatMessage[],
    latest: ItemChatMessage[],
    prevHasMore: boolean,
    latestHasMore: boolean,
): { messages: ItemChatMessage[]; hasMore: boolean } {
    if (latest.length === 0) {
        return { messages: prev, hasMore: prevHasMore };
    }

    if (prev.length === 0) {
        return { messages: latest, hasMore: latestHasMore };
    }

    const oldestLatest = latest[0].id;
    const newestLatest = latest[latest.length - 1].id;
    const older = prev.filter((row) => row.id < oldestLatest);
    const newer = prev.filter((row) => row.id > newestLatest);

    return {
        messages: dedupeMessagesById([...older, ...latest, ...newer]),
        // Cursor is oldest local when history already prepended.
        hasMore: older.length > 0 ? prevHasMore : latestHasMore,
    };
}

export function touchLruOrder(
    order: string[],
    chatId: string,
    max: number,
): { order: string[]; evicted: string[] } {
    const next = order.filter((id) => id !== chatId);
    next.push(chatId);
    const evicted: string[] = [];

    while (next.length > max) {
        const id = next.shift();

        if (id) {
            evicted.push(id);
        }
    }

    return { order: next, evicted };
}
