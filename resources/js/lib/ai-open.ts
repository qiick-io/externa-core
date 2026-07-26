/** Custom event the AI FAB listens for to open with a seeded composer. */
export const AI_OPEN_EVENT = 'ai:open';

export type AiOpenDetail = {
    prompt: string;
};

/** Soft cap for ids listed in bulk prompts (full count still shown). */
export const AI_PROMPT_ID_CAP = 50;

/**
 * Open the floating AI assistant with a prefilled composer (does not send).
 */
export function openAiWithPrompt(prompt: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<AiOpenDetail>(AI_OPEN_EVENT, {
            detail: { prompt },
        }),
    );
}

function truncateList<T>(items: T[]): { shown: T[]; total: number; capped: boolean } {
    const total = items.length;
    const capped = total > AI_PROMPT_ID_CAP;

    return {
        shown: capped ? items.slice(0, AI_PROMPT_ID_CAP) : items,
        total,
        capped,
    };
}

function capNote(total: number, capped: boolean): string {
    return capped ? ` (showing first ${AI_PROMPT_ID_CAP} of ${total})` : '';
}

export function seedCollectionPrompt(collection: {
    id: number;
    name: string;
    slug: string;
}): string {
    return `Working on collection «${collection.name}» (collection_id=${collection.id}, slug=${collection.slug}).`;
}

export function seedCollectionsBulkPrompt(
    collections: Array<{ id: number; name: string; slug: string }>,
): string {
    const { shown, total, capped } = truncateList(collections);
    const list = JSON.stringify(
        shown.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    );

    return `Working on ${total} collections${capNote(total, capped)}: ${list}.\nHelp me with these selected collections:`;
}

export function seedItemPrompt(item: {
    id: number;
    collection_id: number;
    label?: string | null;
}): string {
    const label =
        item.label && item.label.trim() !== ''
            ? `, title=«${item.label.trim()}»`
            : '';

    return `Working on item (item_id=${item.id}, collection_id=${item.collection_id}${label}).`;
}

export function seedItemsBulkPrompt(
    collection: { id: number; name: string },
    items: Array<{ id: number; label?: string | null }>,
): string {
    const { shown, total, capped } = truncateList(items);
    const list = JSON.stringify(
        shown.map((item) => ({
            id: item.id,
            ...(item.label ? { title: item.label } : {}),
        })),
    );

    return `Working on ${total} items in collection «${collection.name}» (collection_id=${collection.id})${capNote(total, capped)}: ${list}.\nHelp me with these selected items:`;
}

export function seedUserPrompt(user: {
    id: number;
    name: string;
    email?: string | null;
}): string {
    const email = user.email ? `, email=${user.email}` : '';

    return `Working on user «${user.name}» (user_id=${user.id}${email}).`;
}

export function seedUsersBulkPrompt(
    users: Array<{ id: number; name: string; email?: string | null }>,
): string {
    const { shown, total, capped } = truncateList(users);
    const list = JSON.stringify(
        shown.map((u) => ({
            id: u.id,
            name: u.name,
            ...(u.email ? { email: u.email } : {}),
        })),
    );

    return `Working on ${total} users${capNote(total, capped)}: ${list}.\nHelp me with these selected users:`;
}

export function seedGroupPrompt(group: {
    id: number;
    name: string;
    slug: string;
}): string {
    return `Working on group «${group.name}» (group_id=${group.id}, slug=${group.slug}).`;
}

export function seedGroupsBulkPrompt(
    groups: Array<{ id: number; name: string; slug: string }>,
): string {
    const { shown, total, capped } = truncateList(groups);
    const list = JSON.stringify(
        shown.map((g) => ({ id: g.id, name: g.name, slug: g.slug })),
    );

    return `Working on ${total} groups${capNote(total, capped)}: ${list}.\nHelp me with these selected groups:`;
}

export function seedActivityLogPrompt(entry: {
    id: number;
    description?: string | null;
    event?: string | null;
}): string {
    const summary = entry.description?.trim() || entry.event || 'activity';

    return `Working on activity log entry (activity_log_id=${entry.id}, summary=«${summary}»).`;
}

export function seedFilePrompt(file: { id: number; name: string }): string {
    return `Working on file «${file.name}» (file_id=${file.id}).`;
}

export function seedFilesBulkPrompt(
    files: Array<{ id: number; name: string }>,
): string {
    const { shown, total, capped } = truncateList(files);
    const list = JSON.stringify(
        shown.map((f) => ({ id: f.id, name: f.name })),
    );

    return `Working on ${total} files${capNote(total, capped)}: ${list}.\nHelp me with these selected files:`;
}
