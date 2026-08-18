import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import { applyChatUnread } from '@/lib/chat-hub-api';

export type ChatUser = {
    id: number;
    name: string;
    email?: string;
};

export type ChatAttachment = {
    id: string;
    name: string;
    mime: string;
    size: number;
    transferred_file_id: number | null;
};

export type ChatReaction = {
    emoji: string;
    count: number;
    reacted: boolean;
};

export type ChatReplyTo = {
    id: number;
    body: string;
    user: ChatUser | null;
};

export type ChatForwardedFrom = {
    message_id: number | null;
    author_name: string;
};

export type ChatPinned = {
    id: number;
    body: string;
    user: ChatUser | null;
};

export type ChatCollection = {
    id: number;
    name: string;
};

export type ChatScope =
    | { mode: 'item'; collectionId: number; itemId: number }
    | { mode: 'hub'; chatId: string };

export type ItemChatMessage = {
    id: number;
    body: string;
    mentioned_user_ids: number[];
    mentioned_users: ChatUser[];
    mentioned_collections?: ChatCollection[];
    user: ChatUser | null;
    attachments: ChatAttachment[];
    reply_to: ChatReplyTo | null;
    is_pinned: boolean;
    pinned_at: string | null;
    forwarded_from: ChatForwardedFrom | null;
    reactions: ChatReaction[];
    created_at: string | null;
    updated_at: string | null;
    can_edit: boolean;
    can_delete: boolean;
};

export type ChatMeta = {
    total: number;
    has_more: boolean;
    per_page: number;
    notify: boolean;
    chat_id?: string | null;
    kind?: 'item' | 'direct';
    visibility_hint?: boolean;
};

export const REACTION_EMOJIS = ['😍', '❤️', '👍', '🤯', '😄', '🤔', '👎'] as const;

function roots(scope: ChatScope): { thread: string; root: string } {
    if (scope.mode === 'hub') {
        return {
            thread: `/chat/${scope.chatId}/messages`,
            root: `/chat/${scope.chatId}`,
        };
    }

    const base = `/collections/${scope.collectionId}/items/${scope.itemId}/chat`;

    return { thread: base, root: base };
}

async function parseError(response: Response, fallback: string): Promise<string> {
    try {
        const payload = (await response.json()) as {
            message?: string;
            errors?: Record<string, string[]>;
        };

        if (payload.message) {
            return payload.message;
        }

        const first = Object.values(payload.errors ?? {})[0]?.[0];
        if (first) {
            return first;
        }
    } catch {
        /* non-JSON */
    }

    return fallback;
}

async function assertOk(response: Response, fallback: string): Promise<void> {
    if (!response.ok) {
        throw new Error(await parseError(response, fallback));
    }
}

export async function fetchMessages(
    scope: ChatScope,
    options?: { beforeId?: number; perPage?: number },
): Promise<{ messages: ItemChatMessage[]; pinned: ChatPinned[]; meta: ChatMeta }> {
    const params = new URLSearchParams();

    if (options?.beforeId) {
        params.set('before_id', String(options.beforeId));
    }

    if (options?.perPage) {
        params.set('per_page', String(options.perPage));
    }

    const query = params.toString();
    const response = await fetch(
        `${roots(scope).thread}${query ? `?${query}` : ''}`,
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Could not load chat.');

    return (await response.json()) as {
        messages: ItemChatMessage[];
        pinned: ChatPinned[];
        meta: ChatMeta;
    };
}

export async function postMessage(
    scope: ChatScope,
    payload: {
        body: string;
        mentioned_user_ids: number[];
        attachment_ids: string[];
        reply_to_id?: number | null;
    },
): Promise<ItemChatMessage> {
    const response = await fetch(roots(scope).thread, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    await assertOk(response, 'Could not send message.');

    const json = (await response.json()) as { message: ItemChatMessage };

    return json.message;
}

export async function patchMessage(
    scope: ChatScope,
    messageId: number,
    payload: { body: string; mentioned_user_ids: number[] },
): Promise<ItemChatMessage> {
    const response = await fetch(
        `${roots(scope).thread}/${messageId}`,
        {
            method: 'PATCH',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify(payload),
        },
    );

    await assertOk(response, 'Could not update message.');

    const json = (await response.json()) as { message: ItemChatMessage };

    return json.message;
}

export async function deleteMessage(
    scope: ChatScope,
    messageId: number,
): Promise<void> {
    const response = await fetch(
        `${roots(scope).thread}/${messageId}`,
        {
            method: 'DELETE',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Could not delete message.');
}

export async function pinMessage(
    scope: ChatScope,
    messageId: number,
    pinned: boolean,
): Promise<ItemChatMessage> {
    const response = await fetch(
        `${roots(scope).thread}/${messageId}/pin`,
        {
            method: 'PUT',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ pinned }),
        },
    );

    await assertOk(response, 'Could not pin message.');

    const json = (await response.json()) as { message: ItemChatMessage };

    return json.message;
}

export async function toggleReaction(
    scope: ChatScope,
    messageId: number,
    emoji: string,
): Promise<{
    message_id: number;
    emoji: string;
    added: boolean;
    reactions: ChatReaction[];
}> {
    const response = await fetch(
        `${roots(scope).thread}/${messageId}/reactions`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ emoji }),
        },
    );

    await assertOk(response, 'Could not toggle reaction.');

    return (await response.json()) as {
        message_id: number;
        emoji: string;
        added: boolean;
        reactions: ChatReaction[];
    };
}

export async function forwardMessage(
    scope: ChatScope,
    messageId: number,
    targetItemId: number,
): Promise<ItemChatMessage> {
    const response = await fetch(
        `${roots(scope).thread}/${messageId}/forward`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ item_id: targetItemId }),
        },
    );

    await assertOk(response, 'Could not forward message.');

    const json = (await response.json()) as { message: ItemChatMessage };

    return json.message;
}

export async function fetchMentions(
    scope: ChatScope,
    q: string,
): Promise<{ users: ChatUser[]; collections: ChatCollection[] }> {
    const params = new URLSearchParams();

    if (q !== '') {
        params.set('q', q);
    }

    const response = await fetch(
        `${roots(scope).root}/mentions?${params}`,
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Could not load mentions.');

    const json = (await response.json()) as {
        users: ChatUser[];
        collections?: ChatCollection[];
    };

    return { users: json.users, collections: json.collections ?? [] };
}

export async function markChatRead(
    scope: ChatScope,
): Promise<{
    unread_count: number;
    unread_private: number;
    unread_collection: number;
}> {
    const response = await fetch(`${roots(scope).root}/read`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not mark chat read.');

    const payload = (await response.json()) as {
        unread_count: number;
        unread_private: number;
        unread_collection: number;
    };
    applyChatUnread(payload);

    return payload;
}

export async function putChatNotify(
    scope: ChatScope,
    notify: boolean,
): Promise<boolean> {
    const response = await fetch(`${roots(scope).root}/notify`, {
        method: 'PUT',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ notify }),
    });

    await assertOk(response, 'Could not update notification preference.');

    const json = (await response.json()) as { notify: boolean };

    return json.notify;
}

export async function uploadChatAttachment(
    scope: ChatScope,
    file: File,
): Promise<ChatAttachment> {
    const body = new FormData();
    body.append('file', file);

    const response = await fetch(
        `${roots(scope).root}/attachments`,
        {
            method: 'POST',
            headers: formRequestHeaders(),
            credentials: 'same-origin',
            body,
        },
    );

    await assertOk(response, 'Could not upload attachment.');

    const json = (await response.json()) as { attachment: ChatAttachment };

    return json.attachment;
}

export function chatAttachmentUrl(
    scope: ChatScope,
    attachmentId: string,
): string {
    return `${roots(scope).root}/attachments/${attachmentId}`;
}

export async function saveChatAttachmentToFiles(
    scope: ChatScope,
    attachmentId: string,
): Promise<{ attachment: ChatAttachment; file: { id: number; name: string } }> {
    const response = await fetch(
        `${roots(scope).root}/attachments/${attachmentId}/save-to-files`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Could not save attachment to Files.');

    return (await response.json()) as {
        attachment: ChatAttachment;
        file: { id: number; name: string };
    };
}

export async function addChatAttachmentToField(
    scope: ChatScope,
    attachmentId: string,
    field: string,
): Promise<void> {
    const response = await fetch(
        `${roots(scope).root}/attachments/${attachmentId}/add-to-field`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ field }),
        },
    );

    await assertOk(response, 'Could not add attachment to field.');
}

export function applyReactionToggle(
    reactions: ChatReaction[],
    emoji: string,
    added: boolean,
    isOwn: boolean,
): ChatReaction[] {
    const next = reactions.map((row) => ({ ...row }));
    const index = next.findIndex((row) => row.emoji === emoji);

    if (added) {
        if (index === -1) {
            next.push({ emoji, count: 1, reacted: isOwn });
        } else {
            next[index] = {
                ...next[index]!,
                count: next[index]!.count + 1,
                reacted: isOwn ? true : next[index]!.reacted,
            };
        }

        return next;
    }

    if (index === -1) {
        return next;
    }

    const count = next[index]!.count - 1;
    if (count <= 0) {
        next.splice(index, 1);
    } else {
        next[index] = {
            ...next[index]!,
            count,
            reacted: isOwn ? false : next[index]!.reacted,
        };
    }

    return next;
}
