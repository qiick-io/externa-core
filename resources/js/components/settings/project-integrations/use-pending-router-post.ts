import { router } from '@inertiajs/react';
import { useState } from 'react';

/**
 * A body-less Inertia POST to `url` (send a test webhook or notification, trigger a
 * deploy) with a pending flag, so the integrations settings can disable the button until
 * the request finishes. The page keeps its scroll position; the server answers with a
 * redirect and a flash message.
 *
 * @param url - The endpoint, from a Wayfinder route helper
 * @returns `isPending` while the request runs and `send` to start it
 */
export function usePendingRouterPost(url: string): {
    isPending: boolean;
    send: () => void;
} {
    const [isPending, setIsPending] = useState(false);

    const send = (): void => {
        setIsPending(true);
        router.post(
            url,
            {},
            {
                preserveScroll: true,
                onFinish: () => setIsPending(false),
            },
        );
    };

    return { isPending, send };
}
