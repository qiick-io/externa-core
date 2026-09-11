import type { StateCreator } from 'zustand';
import type { ChatPinned, ItemChatMessage } from '@/lib/item-chat-api';
import type { ChatStore } from '@/stores/chat/store';
import {
    MESSAGES_CACHE_MAX,
    appendMessageDedupe,
    prependOlderDedupe,
    touchLruOrder,
} from '@/stores/chat/types';
import type { MessagesCacheEntry } from '@/stores/chat/types';

export type MessagesSlice = {
    messagesByChatId: Record<string, MessagesCacheEntry>;
    messagesLru: string[];
    setMessagesCache: (
        chatId: string,
        payload: {
            messages: ItemChatMessage[];
            hasMore: boolean;
            pinned: ChatPinned[];
        },
    ) => void;
    prependOlderMessages: (
        chatId: string,
        older: ItemChatMessage[],
        hasMore: boolean,
    ) => void;
    appendMessage: (chatId: string, message: ItemChatMessage) => void;
    replaceMessage: (chatId: string, message: ItemChatMessage) => void;
    removeMessage: (chatId: string, messageId: number) => void;
    mapMessages: (
        chatId: string,
        map: (prev: ItemChatMessage[]) => ItemChatMessage[],
    ) => void;
    setPinned: (chatId: string, pinned: ChatPinned[]) => void;
    mapPinned: (
        chatId: string,
        map: (prev: ChatPinned[]) => ChatPinned[],
    ) => void;
    touchMessages: (chatId: string) => void;
    clearMessages: (chatId: string) => void;
    resetMessages: () => void;
};

function applyLru(
    byChatId: Record<string, MessagesCacheEntry>,
    lru: string[],
    chatId: string,
): {
    messagesByChatId: Record<string, MessagesCacheEntry>;
    messagesLru: string[];
} {
    const { order, evicted } = touchLruOrder(lru, chatId, MESSAGES_CACHE_MAX);
    const next = { ...byChatId };

    for (const id of evicted) {
        delete next[id];
    }

    return { messagesByChatId: next, messagesLru: order };
}

const emptyMessages = (): MessagesCacheEntry => ({
    messages: [],
    hasMore: false,
    pinned: [],
    fetchedAt: null,
    status: 'idle',
});

export const createMessagesSlice: StateCreator<
    ChatStore,
    [],
    [],
    MessagesSlice
> = (set) => ({
    messagesByChatId: {},
    messagesLru: [],
    setMessagesCache: (chatId, payload) =>
        set((state) => {
            const base = applyLru(
                state.messagesByChatId,
                state.messagesLru,
                chatId,
            );

            return {
                ...base,
                messagesByChatId: {
                    ...base.messagesByChatId,
                    [chatId]: {
                        messages: payload.messages,
                        hasMore: payload.hasMore,
                        pinned: payload.pinned,
                        fetchedAt: Date.now(),
                        status: 'ready',
                    },
                },
            };
        }),
    prependOlderMessages: (chatId, older, hasMore) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId] ?? emptyMessages();
            const base = applyLru(
                state.messagesByChatId,
                state.messagesLru,
                chatId,
            );

            return {
                ...base,
                messagesByChatId: {
                    ...base.messagesByChatId,
                    [chatId]: {
                        ...prev,
                        messages: prependOlderDedupe(prev.messages, older),
                        hasMore,
                        fetchedAt: Date.now(),
                        status: 'ready',
                    },
                },
            };
        }),
    appendMessage: (chatId, message) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            const messages = appendMessageDedupe(prev.messages, message);

            if (messages === prev.messages) {
                return state;
            }

            const base = applyLru(
                state.messagesByChatId,
                state.messagesLru,
                chatId,
            );

            return {
                ...base,
                messagesByChatId: {
                    ...base.messagesByChatId,
                    [chatId]: { ...prev, messages },
                },
            };
        }),
    replaceMessage: (chatId, message) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: {
                        ...prev,
                        messages: prev.messages.map((row) =>
                            row.id === message.id ? message : row,
                        ),
                    },
                },
            };
        }),
    removeMessage: (chatId, messageId) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: {
                        ...prev,
                        messages: prev.messages.filter(
                            (row) => row.id !== messageId,
                        ),
                        pinned: prev.pinned.filter(
                            (row) => row.id !== messageId,
                        ),
                    },
                },
            };
        }),
    mapMessages: (chatId, map) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            const messages = map(prev.messages);

            if (messages === prev.messages) {
                return state;
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: { ...prev, messages },
                },
            };
        }),
    setPinned: (chatId, pinned) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: { ...prev, pinned },
                },
            };
        }),
    mapPinned: (chatId, map) =>
        set((state) => {
            const prev = state.messagesByChatId[chatId];

            if (!prev) {
                return state;
            }

            const pinned = map(prev.pinned);

            if (pinned === prev.pinned) {
                return state;
            }

            return {
                messagesByChatId: {
                    ...state.messagesByChatId,
                    [chatId]: { ...prev, pinned },
                },
            };
        }),
    touchMessages: (chatId) =>
        set((state) => {
            if (!state.messagesByChatId[chatId]) {
                return state;
            }

            return applyLru(state.messagesByChatId, state.messagesLru, chatId);
        }),
    clearMessages: (chatId) =>
        set((state) => {
            const messagesByChatId = { ...state.messagesByChatId };
            delete messagesByChatId[chatId];

            return {
                messagesByChatId,
                messagesLru: state.messagesLru.filter((id) => id !== chatId),
            };
        }),
    resetMessages: () => set({ messagesByChatId: {}, messagesLru: [] }),
});
