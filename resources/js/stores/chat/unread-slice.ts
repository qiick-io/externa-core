import type { StateCreator } from 'zustand';
import type { ChatUnreadShare } from '@/lib/chat-hub-api';
import { emptyUnread } from '@/stores/chat/types';
import type { ChatStore } from '@/stores/chat/store';

export type UnreadSlice = {
    unread: ChatUnreadShare;
    setUnread: (payload: ChatUnreadShare) => void;
    resetUnread: () => void;
};

export const createUnreadSlice: StateCreator<
    ChatStore,
    [],
    [],
    UnreadSlice
> = (set) => ({
    unread: emptyUnread(),
    setUnread: (payload) => set({ unread: payload }),
    resetUnread: () => set({ unread: emptyUnread() }),
});
