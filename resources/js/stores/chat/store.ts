import { create } from 'zustand';
import { createHubSlice } from '@/stores/chat/hub-slice';
import type { HubSlice } from '@/stores/chat/hub-slice';
import { createMessagesSlice } from '@/stores/chat/messages-slice';
import type { MessagesSlice } from '@/stores/chat/messages-slice';
import { createThreadsSlice } from '@/stores/chat/threads-slice';
import type { ThreadsSlice } from '@/stores/chat/threads-slice';
import { createUnreadSlice } from '@/stores/chat/unread-slice';
import type { UnreadSlice } from '@/stores/chat/unread-slice';

export type ChatStore = UnreadSlice & ThreadsSlice & HubSlice & MessagesSlice;

export const useChatStore = create<ChatStore>()((...args) => ({
    ...createUnreadSlice(...args),
    ...createThreadsSlice(...args),
    ...createHubSlice(...args),
    ...createMessagesSlice(...args),
}));
