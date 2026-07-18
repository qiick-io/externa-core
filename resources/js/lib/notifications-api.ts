import { jsonRequestHeaders } from '@/lib/csrf';

/** Fired when unread notifications may have changed (e.g. after a polled job completes). */
export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated';

export function notifyNotificationsUpdated(): void {
    window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

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
        [key: string]: unknown;
    };
    read_at: string | null;
    created_at: string;
};

async function parseResponseError(
    response: Response,
    fallbackMessage: string,
): Promise<string> {
    try {
        const payload = (await response.json()) as {
            message?: string;
        };

        if (payload.message) {
            return payload.message;
        }
    } catch {
        // Ignore JSON parse failures.
    }

    return fallbackMessage;
}

async function assertOkResponse(
    response: Response,
    fallbackMessage: string,
): Promise<void> {
    if (!response.ok) {
        throw new Error(await parseResponseError(response, fallbackMessage));
    }
}

export async function fetchNotifications(page = 1): Promise<{
    data: AppNotification[];
    current_page: number;
    last_page: number;
    total: number;
}> {
    const response = await fetch(`/notifications?page=${page}`, {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to load notifications');

    return (await response.json()) as {
        data: AppNotification[];
        current_page: number;
        last_page: number;
        total: number;
    };
}

export async function fetchUnreadNotificationCount(): Promise<number> {
    const response = await fetch('/notifications/unread-count', {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to load unread count');

    const payload = (await response.json()) as { count: number };

    return payload.count;
}

export async function markNotificationsRead(options?: {
    ids?: string[];
    all?: boolean;
}): Promise<number> {
    const response = await fetch('/notifications/read', {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({
            ids: options?.ids,
            all: options?.all ?? false,
        }),
    });

    await assertOkResponse(response, 'Failed to mark notifications read');

    const payload = (await response.json()) as { unread_count: number };

    return payload.unread_count;
}
