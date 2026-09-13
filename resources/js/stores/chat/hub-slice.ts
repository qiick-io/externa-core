import type { StateCreator } from 'zustand';
import type { ChatSummary } from '@/lib/chat-hub-api';
import type { ChatStore } from '@/stores/chat/store';

export type HubSlice = {
    activeTab: 'collection' | 'private';
    query: string;
    setTab: (tab: 'collection' | 'private') => void;
    setQuery: (q: string) => void;
    /** Patch thread fields in every cached list (preview / unread / timestamps). */
    patchThread: (chatId: string, partial: Partial<ChatSummary>) => void;
    resetHub: () => void;
};

export const createHubSlice: StateCreator<ChatStore, [], [], HubSlice> = (
    set,
) => ({
    activeTab: 'collection',
    query: '',
    setTab: (tab) => set({ activeTab: tab }),
    setQuery: (q) => set({ query: q }),
    patchThread: (chatId, partial) =>
        set((state) => {
            const threadsByKey = { ...state.threadsByKey };
            let changed = false;

            for (const [key, entry] of Object.entries(threadsByKey)) {
                const index = entry.items.findIndex((row) => row.id === chatId);

                if (index < 0) {
                    continue;
                }

                changed = true;
                const items = entry.items.slice();
                items[index] = { ...items[index], ...partial };
                threadsByKey[key] = { ...entry, items };
            }

            return changed ? { threadsByKey } : state;
        }),
    resetHub: () => set({ activeTab: 'collection', query: '' }),
});
