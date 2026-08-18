import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';

export type ChatSummary = {
    id: string;
    kind: 'item' | 'direct';
    title: string;
    collection_id: number | null;
    collection_item_id: number | null;
    collection_name: string | null;
    item_label: string | null;
    participants: Array<{ type: string; id: number; name: string }>;
    last_message: {
        id: number;
        body: string;
        user_name: string | null;
        created_at: string | null;
        image_attachment_id: string | null;
    } | null;
    unread_count: number;
    collection_icon: string | null;
    collection_color: string | null;
    updated_at: string | null;
};

export type ChatUnreadShare = {
    unread_count: number;
    unread_private: number;
    unread_collection: number;
};

/** Custom event when chat unread totals change (mark-read or poll). */
export const CHAT_UNREAD_UPDATED_EVENT = 'chat:unread-updated';

export function applyChatUnread(payload: ChatUnreadShare): void {
    window.dispatchEvent(
        new CustomEvent<ChatUnreadShare>(CHAT_UNREAD_UPDATED_EVENT, {
            detail: payload,
        }),
    );
}

async function assertOk(response: Response, fallback: string): Promise<void> {
    if (response.ok) {
        return;
    }

    try {
        const payload = (await response.json()) as {
            message?: string;
            errors?: Record<string, string[]>;
        };
        const first = Object.values(payload.errors ?? {})[0]?.[0];

        throw new Error(payload.message ?? first ?? fallback);
    } catch (error) {
        if (error instanceof Error && error.message !== fallback) {
            throw error;
        }

        throw new Error(fallback);
    }
}

export async function fetchChatThreads(options: {
    tab: 'collection' | 'private';
    q?: string;
    collectionId?: number;
}): Promise<{
    data: ChatSummary[];
    meta: { can_create_direct: boolean };
}> {
    const params = new URLSearchParams();
    params.set('tab', options.tab);

    if (options.q) {
        params.set('q', options.q);
    }

    if (options.collectionId) {
        params.set('collection_id', String(options.collectionId));
    }

    const response = await fetch(`/chat/threads?${params}`, {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not load chats.');

    return (await response.json()) as {
        data: ChatSummary[];
        meta: { can_create_direct: boolean } & ChatUnreadShare;
    };
}

export async function fetchChatUnread(): Promise<ChatUnreadShare> {
    const response = await fetch('/chat/unread-count', {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not load unread counts.');

    return (await response.json()) as ChatUnreadShare;
}

export async function markHubChatRead(chatId: string): Promise<ChatUnreadShare> {
    const response = await fetch(`/chat/${chatId}/read`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not mark chat read.');

    const payload = (await response.json()) as ChatUnreadShare;
    applyChatUnread(payload);

    return payload;
}

export async function createChatThread(payload: {
    kind: 'item' | 'direct';
    collection_id?: number;
    item_id?: number;
    user_ids?: number[];
    group_ids?: number[];
}): Promise<ChatSummary> {
    const response = await fetch('/chat/threads', {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    await assertOk(response, 'Could not create chat.');

    const json = (await response.json()) as { chat: ChatSummary };

    return json.chat;
}

export type ChatListMeta = {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    has_more: boolean;
};

export type ChatDirectoryRow =
    | {
          type: 'user';
          id: number;
          name: string;
          email: string;
          first_name: string;
          last_name: string;
      }
    | { type: 'group'; id: number; name: string };

export type ChatItemPickerGroup = {
    id: number;
    name: string;
    items: Array<{ id: number; label: string }>;
};

async function fetchPaged<T>(
    path: string,
    q: string,
    page: number,
    fallback: string,
): Promise<{ data: T[]; meta: ChatListMeta }> {
    const params = new URLSearchParams();
    params.set('page', String(page));

    if (q) {
        params.set('q', q);
    }

    const response = await fetch(`${path}?${params}`, {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, fallback);

    return (await response.json()) as { data: T[]; meta: ChatListMeta };
}

export async function fetchChatDirectory(
    q: string,
    page = 1,
): Promise<{ data: ChatDirectoryRow[]; meta: ChatListMeta }> {
    return fetchPaged<ChatDirectoryRow>(
        '/chat/options/directory',
        q,
        page,
        'Could not search people.',
    );
}

export async function fetchChatItemPicker(
    q: string,
    page = 1,
): Promise<{ data: ChatItemPickerGroup[]; meta: ChatListMeta }> {
    return fetchPaged<ChatItemPickerGroup>(
        '/chat/options/item-picker',
        q,
        page,
        'Could not search items.',
    );
}

export { formRequestHeaders };
