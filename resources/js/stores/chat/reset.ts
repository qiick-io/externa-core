import { useChatStore } from '@/stores/chat/store';

/** Clear all chat session cache (logout / full auth change). */
export function resetChatStore(): void {
    const state = useChatStore.getState();
    state.resetUnread();
    state.resetThreads();
    state.resetHub();
    state.resetMessages();
}
