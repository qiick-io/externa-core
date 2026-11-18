import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { usePendingRouterPost } from '@/components/settings/project-integrations/use-pending-router-post';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    router: { post },
}));

describe('usePendingRouterPost', () => {
    beforeEach(() => {
        post.mockReset();
    });

    it('posts an empty body with preserved scroll and is pending until it finishes', () => {
        const { result } = renderHook(() =>
            usePendingRouterPost('/settings/project/integrations/webhook-test'),
        );

        expect(result.current.isPending).toBe(false);

        act(() => {
            result.current.send();
        });

        expect(result.current.isPending).toBe(true);
        expect(post).toHaveBeenCalledTimes(1);

        const [url, body, options] = post.mock.calls[0];

        expect(url).toBe('/settings/project/integrations/webhook-test');
        expect(body).toEqual({});
        expect(options.preserveScroll).toBe(true);

        act(() => {
            options.onFinish();
        });

        expect(result.current.isPending).toBe(false);
    });
});
