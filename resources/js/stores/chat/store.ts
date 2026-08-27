import { create } from 'zustand';
import { createHubSlice, type HubSlice } from '@/stores/chat/hub-slice';
import {
    createMessagesSlice,
    type MessagesSlice,
} from '@/stores/chat/messages-slice';
import {
    createThreadsSlice,
    type ThreadsSlice,
} from '@/stores/chat/threads-slice';
import {
    createUnreadSlice,
    type UnreadSlice,
} from '@/stores/chat/unread-slice';

export type ChatStore = UnreadSlice &
    ThreadsSlice &
    HubSlice &
    MessagesSlice;

export const useChatStore = create<ChatStore>()((...args) => ({
    ...createUnreadSlice(...args),
    ...createThreadsSlice(...args),
    ...createHubSlice(...args),
    ...createMessagesSlice(...args),
}));
