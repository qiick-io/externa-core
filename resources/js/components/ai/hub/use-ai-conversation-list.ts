import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { groupConversations } from '@/components/ai/hub/ai-conversation-groups';
import { fetchAiConversationsPage } from '@/lib/ai-chat';
import type { AiConversationSummary } from '@/lib/ai-chat';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { toast } from '@/lib/toast';
import type { Paginated } from '@/types/admin';

export type AiConversationsProp =
    | LaravelPaginated<AiConversationSummary>
    | Paginated<AiConversationSummary>;

/**
 * Sidebar state of the AI hub: the loaded conversation pages, the debounced
 * server-side title search, "load more", and the checkbox selection with
 * shift-click ranges used by bulk delete.
 *
 * Local rows are re-seeded from the Inertia prop only when its content changes,
 * so optimistic removals after a fetch-delete survive a stale props object.
 * @param {AiConversationsProp} conversationsProp - Server page of conversations.
 */
export function useAiConversationList(conversationsProp: AiConversationsProp) {
    const { t } = useTranslation();
    const initialPaginated = normalizePaginated(conversationsProp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [conversationItems, setConversationItems] = useState<
        AiConversationSummary[]
    >(initialPaginated.data);
    const [listPage, setListPage] = useState(initialPaginated.current_page);
    const [listLastPage, setListLastPage] = useState(
        initialPaginated.last_page,
    );
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [conversationQuery, setConversationQuery] = useState('');
    const hasSearchedConversationsRef = useRef(false);
    const lastSelectedIndexRef = useRef<number | null>(null);

    // Fingerprint server list content so a new props object with the same rows
    // cannot wipe optimistic local removals (fetch-delete leaves Inertia props stale).
    const conversationsSyncKey = useMemo(() => {
        const paginated = normalizePaginated(conversationsProp);

        return JSON.stringify({
            current_page: paginated.current_page,
            last_page: paginated.last_page,
            items: paginated.data.map((conversation) => [
                String(conversation.id),
                conversation.pinned_at ?? null,
                conversation.title,
                conversation.updated_at ?? null,
            ]),
        });
    }, [conversationsProp]);

    useEffect(() => {
        const nextPage = normalizePaginated(conversationsProp);

        setConversationItems(nextPage.data);
        setListPage(nextPage.current_page);
        setListLastPage(nextPage.last_page);
        lastSelectedIndexRef.current = null;
        // conversationsSyncKey is a content fingerprint of conversationsProp
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting on prop identity alone
    }, [conversationsSyncKey]);

    const conversationSections = useMemo(
        () => groupConversations(conversationItems),
        [conversationItems],
    );

    const flatConversationIds = useMemo(
        () =>
            conversationSections.flatMap((section) =>
                section.conversations.map((conversation) => conversation.id),
            ),
        [conversationSections],
    );

    const conversationIndexById = useMemo(() => {
        const indexes = new Map<string, number>();

        flatConversationIds.forEach((conversationId, index) => {
            indexes.set(conversationId, index);
        });

        return indexes;
    }, [flatConversationIds]);

    const hasMoreConversations = listPage < listLastPage;

    const removeConversationsFromSidebar = (ids: string[]) => {
        const deletedIds = new Set(ids.map(String));

        setConversationItems((current) =>
            current.filter(
                (conversation) => !deletedIds.has(String(conversation.id)),
            ),
        );
        setSelectedIds((current) => {
            const next = new Set(current);

            for (const deletedId of deletedIds) {
                next.delete(deletedId);
            }

            return next;
        });
        lastSelectedIndexRef.current = null;
    };

    const toggleSelected = (id: string, checked: boolean, index: number) => {
        lastSelectedIndexRef.current = index;
        setSelectedIds((current) => {
            const next = new Set(current);

            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }

            return next;
        });
    };

    const selectRange = (fromIndex: number, toIndex: number) => {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);

        setSelectedIds((current) => {
            const next = new Set(current);

            for (let index = start; index <= end; index++) {
                const conversationIdInRange = flatConversationIds[index];

                if (conversationIdInRange) {
                    next.add(conversationIdInRange);
                }
            }

            return next;
        });
    };

    const handleCheckboxPointerDown = (
        event: ReactPointerEvent,
        index: number,
    ) => {
        if (!event.shiftKey || lastSelectedIndexRef.current === null) {
            return;
        }

        // Prevent Radix toggle so shift-click only expands the range.
        event.preventDefault();
        selectRange(lastSelectedIndexRef.current, index);
    };

    // Server-side title search (debounced): replaces the loaded list with page 1.
    useEffect(() => {
        if (!hasSearchedConversationsRef.current && conversationQuery === '') {
            return;
        }

        hasSearchedConversationsRef.current = true;
        let cancelled = false;
        const timeoutId = window.setTimeout(() => {
            void fetchAiConversationsPage(1, 25, conversationQuery.trim())
                .then((firstPage) => {
                    if (cancelled) {
                        return;
                    }

                    setConversationItems(firstPage.data);
                    setListPage(firstPage.current_page);
                    setListLastPage(firstPage.last_page);
                })
                .catch(() => {
                    if (!cancelled) {
                        toast.error(t('ai.unableLoadMoreChats'));
                    }
                });
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [conversationQuery, t]);

    const handleLoadMoreConversations = async () => {
        if (isLoadingMore || !hasMoreConversations) {
            return;
        }

        setIsLoadingMore(true);

        try {
            const nextPage = await fetchAiConversationsPage(
                listPage + 1,
                25,
                conversationQuery.trim(),
            );
            setConversationItems((current) => {
                const seenIds = new Set(
                    current.map((conversation) => conversation.id),
                );
                const appended = nextPage.data.filter(
                    (conversation) => !seenIds.has(conversation.id),
                );

                return [...current, ...appended];
            });
            setListPage(nextPage.current_page);
            setListLastPage(nextPage.last_page);
        } catch {
            toast.error(t('ai.unableLoadMoreChats'));
        } finally {
            setIsLoadingMore(false);
        }
    };

    return {
        conversationItems,
        conversationSections,
        conversationIndexById,
        conversationQuery,
        setConversationQuery,
        hasMoreConversations,
        isLoadingMore,
        handleLoadMoreConversations,
        selectedIds,
        toggleSelected,
        handleCheckboxPointerDown,
        removeConversationsFromSidebar,
    };
}

export type AiConversationList = ReturnType<typeof useAiConversationList>;
