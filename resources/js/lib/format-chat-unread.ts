/**
 * Telegram-style unread badge text. Caps at 99.
 */
export function formatChatUnread(count: number): string {
    if (count <= 0) {
        return '';
    }

    return count > 99 ? '99+' : String(count);
}
