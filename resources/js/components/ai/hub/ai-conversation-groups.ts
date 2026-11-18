import type { AiConversationSummary } from '@/lib/ai-chat';
import i18n from '@/lib/i18n';
import { index as aiIndex, show as aiShow } from '@/routes/ai';

/**
 * Sidebar grouping for the AI hub: pinned chats first, then buckets by the
 * local calendar day of their last update (today, yesterday, …, older).
 */
export type ConversationSection = {
    key: string;
    label: string;
    conversations: AiConversationSummary[];
};

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    return Math.round(
        (startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) /
            millisecondsPerDay,
    );
}

function conversationDateGroup(updatedAt: string | null | undefined): {
    key: string;
    label: string;
    order: number;
} {
    const now = new Date();
    const updated = updatedAt ? new Date(updatedAt) : now;
    const dayDelta = daysBetween(updated, now);

    if (dayDelta <= 0) {
        return { key: 'today', label: i18n.t('ai.today'), order: 0 };
    }

    if (dayDelta === 1) {
        return { key: 'yesterday', label: i18n.t('ai.yesterday'), order: 1 };
    }

    if (dayDelta === 2) {
        return { key: '2-days', label: i18n.t('ai.twoDaysAgo'), order: 2 };
    }

    if (dayDelta < 7) {
        return { key: 'week', label: i18n.t('ai.thisWeek'), order: 3 };
    }

    if (dayDelta < 14) {
        return { key: 'last-week', label: i18n.t('ai.aWeekAgo'), order: 4 };
    }

    if (dayDelta < 30) {
        return { key: 'month', label: i18n.t('ai.thisMonth'), order: 5 };
    }

    return { key: 'older', label: i18n.t('ai.older'), order: 6 };
}

/**
 * Splits the loaded conversations into the sidebar sections, keeping the
 * server order inside each section.
 * @param {AiConversationSummary[]} conversations - Loaded sidebar rows.
 * @returns {ConversationSection[]}
 */
export function groupConversations(
    conversations: AiConversationSummary[],
): ConversationSection[] {
    const pinned = conversations.filter(
        (conversation) => conversation.pinned_at != null,
    );
    const unpinned = conversations.filter(
        (conversation) => conversation.pinned_at == null,
    );

    const sections: ConversationSection[] = [];

    if (pinned.length > 0) {
        sections.push({
            key: 'pinned',
            label: i18n.t('ai.pinned'),
            conversations: pinned,
        });
    }

    const buckets = new Map<string, ConversationSection & { order: number }>();

    for (const conversation of unpinned) {
        const group = conversationDateGroup(conversation.updated_at);

        const existing = buckets.get(group.key);

        if (existing) {
            existing.conversations.push(conversation);
        } else {
            buckets.set(group.key, {
                key: group.key,
                label: group.label,
                order: group.order,
                conversations: [conversation],
            });
        }
    }

    for (const section of [...buckets.values()].sort(
        (left, right) => left.order - right.order,
    )) {
        sections.push({
            key: section.key,
            label: section.label,
            conversations: section.conversations,
        });
    }

    return sections;
}

/**
 * Hub URL for a conversation, or the hub index when none is selected.
 * @param {string | null} conversationId - Conversation to open.
 * @returns {string}
 */
export function conversationUrl(conversationId: string | null): string {
    if (!conversationId) {
        return aiIndex.url();
    }

    return aiShow.url(conversationId);
}
