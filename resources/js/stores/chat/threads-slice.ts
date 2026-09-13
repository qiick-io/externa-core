import type { StateCreator } from 'zustand';
import type { ChatSummary } from '@/lib/chat-hub-api';
import type { ChatStore } from '@/stores/chat/store';
import type { CacheStatus, ThreadsCacheEntry } from '@/stores/chat/types';
import {
    threadMatchesPrivateQuery,
    upsertThreadInList,
} from '@/stores/chat/types';

export type ThreadsSlice = {
    threadsByKey: Record<string, ThreadsCacheEntry>;
    setThreads: (key: string, items: ChatSummary[]) => void;
    setThreadsStatus: (key: string, status: CacheStatus) => void;
    /** Live hub: insert/update private thread without wiping the list. */
    upsertThread: (thread: ChatSummary) => void;
    removeThread: (chatId: string) => void;
    resetThreads: () => void;
};

const emptyEntry = (): ThreadsCacheEntry => ({
    items: [],
    loadedAt: null,
    status: 'idle',
});

export const createThreadsSlice: StateCreator<
    ChatStore,
    [],
    [],
    ThreadsSlice
> = (set) => ({
    threadsByKey: {},
    setThreads: (key, items) =>
        set((state) => ({
            threadsByKey: {
                ...state.threadsByKey,
                [key]: {
                    items,
                    loadedAt: Date.now(),
                    status: 'ready',
                },
            },
        })),
    setThreadsStatus: (key, status) =>
        set((state) => {
            const prev = state.threadsByKey[key] ?? emptyEntry();

            return {
                threadsByKey: {
                    ...state.threadsByKey,
                    [key]: { ...prev, status },
                },
            };
        }),
    upsertThread: (thread) =>
        set((state) => {
            if (thread.kind !== 'direct') {
                return state;
            }

            const threadsByKey = { ...state.threadsByKey };
            let changed = false;

            for (const [key, entry] of Object.entries(threadsByKey)) {
                const isPrivate = key.startsWith('private|');
                const isArchivedList = key.startsWith('archived|');

                if (
                    (!isPrivate && !isArchivedList) ||
                    entry.status !== 'ready'
                ) {
                    continue;
                }

                const q = isPrivate
                    ? key.slice('private|'.length)
                    : key.slice('archived|'.length);
                const index = entry.items.findIndex(
                    (row) => row.id === thread.id,
                );

                // Live upserts belong in the active private list only.
                if (isArchivedList) {
                    if (index < 0) {
                        continue;
                    }

                    changed = true;
                    threadsByKey[key] = {
                        ...entry,
                        items: entry.items.filter(
                            (row) => row.id !== thread.id,
                        ),
                    };

                    continue;
                }

                if (index < 0 && !threadMatchesPrivateQuery(thread, q)) {
                    continue;
                }

                changed = true;
                threadsByKey[key] = {
                    ...entry,
                    items: upsertThreadInList(entry.items, {
                        ...thread,
                        archived: false,
                    }),
                };
            }

            return changed ? { threadsByKey } : state;
        }),
    removeThread: (chatId) =>
        set((state) => {
            const threadsByKey: Record<string, ThreadsCacheEntry> = {};

            for (const [key, entry] of Object.entries(state.threadsByKey)) {
                threadsByKey[key] = {
                    ...entry,
                    items: entry.items.filter((row) => row.id !== chatId),
                };
            }

            return { threadsByKey };
        }),
    resetThreads: () => set({ threadsByKey: {} }),
});
