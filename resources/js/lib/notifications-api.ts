import { jsonRequestHeaders } from '@/lib/csrf';
import { requestJson } from '@/lib/http';

/** Custom event name fired when unread notification counts may have changed. */
export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated';

/**
 * Dispatches {@link NOTIFICATIONS_UPDATED_EVENT} so UI hooks can refresh unread counts.
 *
 * @returns {void}
 */
export function notifyNotificationsUpdated(): void {
    window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

/** Database notification row as returned by the notifications API. */
export type AppNotification = {
    id: string;
    type: string;
    data: {
        type?: string;
        title?: string;
        body?: string;
        job_id?: string;
        count?: number;
        file_id?: number | null;
        path?: string | null;
        folder_id?: number | null;
        download_url?: string | null;
        expires_at?: string | null;
        zip_bytes?: number | null;
        collection_id?: number | null;
        item_id?: number | null;
        comment_id?: number | null;
        url?: string | null;
        [key: string]: unknown;
    };
    read_at: string | null;
    created_at: string;
};

/**
 * Fetches a paginated page of notifications for the authenticated user.
 *
 * @param page - 1-based page number
 * @returns Paginated notification list
 */
export async function fetchNotifications(page = 1): Promise<{
    data: AppNotification[];
    current_page: number;
    last_page: number;
    total: number;
}> {
    return requestJson(
        `/notifications?page=${page}`,
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
        'Failed to load notifications',
    );
}

/**
 * Returns the current unread notification count.
 *
 * @returns Unread count
 */
export async function fetchUnreadNotificationCount(): Promise<number> {
    const payload = await requestJson<{ count: number }>(
        '/notifications/unread-count',
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
        'Failed to load unread count',
    );

    return payload.count;
}

/**
 * Marks notifications as read by id or in bulk.
 *
 * @param options - Optional ids to mark, or `all: true` for every notification
 * @returns Updated unread count after the operation
 */
export async function markNotificationsRead(options?: {
    ids?: string[];
    all?: boolean;
}): Promise<number> {
    const payload = await requestJson<{ unread_count: number }>(
        '/notifications/read',
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({
                ids: options?.ids,
                all: options?.all ?? false,
            }),
        },
        'Failed to mark notifications read',
    );

    return payload.unread_count;
}

/**
 * Marks notifications as unread by id.
 *
 * @param ids - Notification ids to mark unread
 * @returns Updated unread count after the operation
 */
export async function markNotificationsUnread(ids: string[]): Promise<number> {
    const payload = await requestJson<{ unread_count: number }>(
        '/notifications/unread',
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ ids }),
        },
        'Failed to mark notifications unread',
    );

    return payload.unread_count;
}
