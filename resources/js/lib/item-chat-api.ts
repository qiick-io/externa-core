import { applyChatUnread } from '@/lib/chat-hub-api';
import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import {
    CHUNK_SIZE_BYTES,
    MAX_CHUNK_RETRIES,
    CHUNK_RETRY_BASE_DELAY_MS,
} from '@/lib/files-api';

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
    has_preview?: boolean;
};

export type ChatReaction = {
    emoji: string;
    count: number;
    reacted: boolean;
    users: ChatUser[];
};

export type ChatReplyTo = {
    id: number;
    body: string;
    user: ChatUser | null;
};

export type ChatPinned = {
    id: number;
    body: string;
    user: ChatUser | null;
    mentioned_users: ChatUser[];
    mentioned_collections?: ChatCollection[];
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

export const REACTION_EMOJIS = [
    '😍',
    '❤️',
    '👍',
    '🤯',
    '😄',
    '🤔',
    '👎',
] as const;

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

async function parseError(
    response: Response,
    fallback: string,
): Promise<string> {
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
): Promise<{
    messages: ItemChatMessage[];
    pinned: ChatPinned[];
    meta: ChatMeta;
}> {
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
    const response = await fetch(`${roots(scope).thread}/${messageId}`, {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    await assertOk(response, 'Could not update message.');

    const json = (await response.json()) as { message: ItemChatMessage };

    return json.message;
}

export async function deleteMessage(
    scope: ChatScope,
    messageId: number,
): Promise<void> {
    const response = await fetch(`${roots(scope).thread}/${messageId}`, {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not delete message.');
}

export async function pinMessage(
    scope: ChatScope,
    messageId: number,
    pinned: boolean,
): Promise<ItemChatMessage> {
    const response = await fetch(`${roots(scope).thread}/${messageId}/pin`, {
        method: 'PUT',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ pinned }),
    });

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

export async function fetchMentions(
    scope: ChatScope,
    q: string,
): Promise<{ users: ChatUser[]; collections: ChatCollection[] }> {
    const params = new URLSearchParams();

    if (q !== '') {
        params.set('q', q);
    }

    const response = await fetch(`${roots(scope).root}/mentions?${params}`, {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not load mentions.');

    const json = (await response.json()) as {
        users: ChatUser[];
        collections?: ChatCollection[];
    };

    return { users: json.users, collections: json.collections ?? [] };
}

export async function markChatRead(scope: ChatScope): Promise<{
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

export async function stopChatViewing(scope: ChatScope): Promise<void> {
    const response = await fetch(`${roots(scope).root}/stop-viewing`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Could not stop viewing chat.');
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
    options?: {
        maxBytes?: number | null;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    },
): Promise<ChatAttachment> {
    assertWithinChatUploadCap(file.size, options?.maxBytes);

    if (file.size > CHUNK_SIZE_BYTES) {
        return uploadChatAttachmentChunked(scope, file, options);
    }

    const body = new FormData();
    body.append('file', file);

    const response = await fetch(`${roots(scope).root}/attachments`, {
        method: 'POST',
        headers: formRequestHeaders(),
        credentials: 'same-origin',
        body,
        signal: options?.signal,
    });

    await assertOk(response, 'Could not upload attachment.');
    options?.onProgress?.(100);

    const json = (await response.json()) as { attachment: ChatAttachment };

    return json.attachment;
}

async function uploadChatAttachmentChunked(
    scope: ChatScope,
    file: File,
    options?: {
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    },
): Promise<ChatAttachment> {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));
    const root = roots(scope).root;

    const initResponse = await fetch(`${root}/attachments/uploads/init`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            file_name: file.name,
            total_size: file.size,
            total_chunks: totalChunks,
            mime_type: file.type || null,
        }),
        signal: options?.signal,
    });

    await assertOk(initResponse, 'Failed to initialize chat upload');

    const { upload_id: uploadId } = (await initResponse.json()) as {
        upload_id: string;
    };

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        if (options?.signal?.aborted) {
            throw new DOMException('Upload aborted', 'AbortError');
        }

        const start = chunkIndex * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
        const chunkBlob = file.slice(start, end);

        await uploadChatChunkWithRetry(
            root,
            uploadId,
            chunkIndex,
            chunkBlob,
            file.name,
            options?.signal,
        );

        options?.onProgress?.(
            Math.round(((chunkIndex + 1) / totalChunks) * 100),
        );
    }

    const completeResponse = await fetch(
        `${root}/attachments/uploads/complete`,
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ upload_id: uploadId }),
            signal: options?.signal,
        },
    );

    await assertOk(completeResponse, 'Failed to complete chat upload');

    const json = (await completeResponse.json()) as {
        attachment: ChatAttachment;
    };

    return json.attachment;
}

async function uploadChatChunkWithRetry(
    root: string,
    uploadId: string,
    chunkIndex: number,
    chunkBlob: Blob,
    fileName: string,
    signal?: AbortSignal,
): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', String(chunkIndex));
        formData.append('chunk', chunkBlob, `${fileName}.part${chunkIndex}`);

        try {
            const chunkResponse = await fetch(
                `${root}/attachments/uploads/chunk`,
                {
                    method: 'POST',
                    headers: formRequestHeaders(),
                    credentials: 'same-origin',
                    body: formData,
                    signal,
                },
            );

            if (chunkResponse.ok) {
                return;
            }

            lastError = new Error(
                await parseError(
                    chunkResponse,
                    `Failed to upload chunk ${chunkIndex + 1}`,
                ),
            );
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }

            lastError =
                error instanceof Error
                    ? error
                    : new Error(`Failed to upload chunk ${chunkIndex + 1}`);
        }

        if (attempt < MAX_CHUNK_RETRIES) {
            await new Promise((resolve) => {
                setTimeout(resolve, CHUNK_RETRY_BASE_DELAY_MS * (attempt + 1));
            });
        }
    }

    throw (
        lastError ??
        new Error(`Failed to upload chunk ${chunkIndex + 1} after retries`)
    );
}

export function assertWithinChatUploadCap(
    fileSize: number,
    maxBytes: number | null | undefined,
): void {
    if (maxBytes == null) {
        return;
    }

    if (fileSize > maxBytes) {
        const mb = Math.round(maxBytes / (1024 * 1024));

        throw new Error(`File exceeds the ${mb} MB chat upload limit.`);
    }
}

export function chatAttachmentUrl(
    scope: ChatScope,
    attachmentId: string,
): string {
    return `${roots(scope).root}/attachments/${attachmentId}`;
}

export function chatAttachmentPreviewUrl(
    scope: ChatScope,
    attachment: ChatAttachment,
): string {
    if (attachment.has_preview) {
        return `${roots(scope).root}/attachments/${attachment.id}/preview`;
    }

    return chatAttachmentUrl(scope, attachment.id);
}

export async function deleteChatAttachment(
    scope: ChatScope,
    attachmentId: string,
): Promise<void> {
    const response = await fetch(
        `${roots(scope).root}/attachments/${attachmentId}`,
        {
            method: 'DELETE',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Could not delete attachment.');
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
