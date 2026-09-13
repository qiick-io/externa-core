import type { ChatCollection, ChatUser } from '@/lib/item-chat-api';

export const MENTION_TOKEN = /@\[user:(\d+)\]/g;
export const COLLECTION_MENTION_TOKEN = /@\[collection:(\d+)\]/g;

export function mentionDisplayLabel(user: Pick<ChatUser, 'name'>): string {
    return `@${user.name}`;
}

export function collectionMentionLabel(
    collection: Pick<ChatCollection, 'name'>,
): string {
    return `@collection:${collection.name}`;
}

export function storedBodyToDraft(
    body: string,
    users: ChatUser[],
    collections: ChatCollection[] = [],
): string {
    let draft = body;

    for (const collection of collections) {
        draft = draft.replaceAll(
            `@[collection:${collection.id}]`,
            collectionMentionLabel(collection),
        );
    }

    for (const user of users) {
        draft = draft.replaceAll(
            `@[user:${user.id}]`,
            mentionDisplayLabel(user),
        );
    }

    return draft;
}

export function composeBodyForSubmit(
    draft: string,
    users: ChatUser[],
    collections: ChatCollection[] = [],
): { body: string; mentionedIds: number[] } {
    let body = draft;
    const mentionedIds: number[] = [];

    const collectionsByLength = [...collections].sort(
        (a, b) => b.name.length - a.name.length,
    );

    for (const collection of collectionsByLength) {
        const label = collectionMentionLabel(collection);

        if (!body.includes(label)) {
            continue;
        }

        body = body.replaceAll(label, `@[collection:${collection.id}]`);
    }

    const byLength = [...users].sort((a, b) => b.name.length - a.name.length);

    for (const user of byLength) {
        const label = mentionDisplayLabel(user);

        if (!body.includes(label)) {
            continue;
        }

        body = body.replaceAll(label, `@[user:${user.id}]`);
        mentionedIds.push(user.id);
    }

    return { body: body.trim(), mentionedIds };
}

export function mentionQueryAt(
    text: string,
    caret: number,
): { start: number; q: string } | null {
    const before = text.slice(0, caret);

    if (/@\[(?:user|collection):\d*\]?$/.test(before)) {
        return null;
    }

    // Allow @ after emoji/punctuation (not only whitespace), e.g. "🚀@name".
    const match = before.match(/(^|[^A-Za-z0-9_@])@([^\s@]*)$/);

    if (!match) {
        return null;
    }

    const q = match[2] ?? '';

    return { start: before.length - q.length - 1, q };
}
