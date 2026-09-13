import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import type { ItemChatMessage } from '@/lib/item-chat-api';

/**
 * Match one optimistic pending bubble to an Echo MessageCreated payload.
 * Must not match still-uploading rows (would drop in-flight sends).
 */
export function pendingMatchesEchoMessage(
    pending: PendingChatMessage,
    message: ItemChatMessage,
): boolean {
    if (pending.status === 'failed' || pending.status === 'uploading') {
        return false;
    }

    if (pending.body !== message.body) {
        return false;
    }

    const uploadedIds = pending.files
        .map((file) => file.uploadedId)
        .filter((id): id is string => id !== null);

    if (uploadedIds.length !== message.attachments.length) {
        return false;
    }

    return uploadedIds.every((id) =>
        message.attachments.some((attachment) => attachment.id === id),
    );
}
