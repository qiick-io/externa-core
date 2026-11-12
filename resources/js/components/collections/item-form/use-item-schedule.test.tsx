import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useItemSchedule } from '@/components/collections/item-form/use-item-schedule';

const routerPost = vi.hoisted(() => vi.fn());

vi.mock('@inertiajs/react', () => ({
    router: { post: routerPost },
}));

type ScheduleProps = Parameters<typeof useItemSchedule>[0];

const PUBLISH_AT = '2026-12-01T09:00:00.000Z';
const UNPUBLISH_AT = '2026-12-31T18:00:00.000Z';

function renderSchedule(props: Partial<ScheduleProps> = {}) {
    return renderHook(
        (hookProps: ScheduleProps) => useItemSchedule(hookProps),
        {
            initialProps: {
                collectionId: 7,
                itemId: 42,
                publishAt: PUBLISH_AT,
                unpublishAt: null,
                contentVersion: 'draft',
                isViewingPublished: false,
                ...props,
            },
        },
    );
}

describe('useItemSchedule', () => {
    afterEach(() => {
        routerPost.mockReset();
    });

    it('saves both dates of the draft as ISO strings', () => {
        const hook = renderSchedule();

        act(() => {
            hook.result.current.setUnpublishAtLocal('2026-12-31T19:00');
        });
        act(() => {
            hook.result.current.saveSchedule();
        });

        expect(hook.result.current.isScheduling).toBe(true);
        expect(routerPost).toHaveBeenCalledWith(
            '/collections/7/items/42/schedule?version=draft',
            {
                publish_at: new Date(
                    hook.result.current.publishAtLocal,
                ).toISOString(),
                unpublish_at: new Date('2026-12-31T19:00').toISOString(),
            },
            expect.any(Object),
        );

        act(() => {
            routerPost.mock.calls[0][2].onFinish();
        });
        expect(hook.result.current.isScheduling).toBe(false);
    });

    it('only sends the unpublish date on the published version', () => {
        const hook = renderSchedule({
            contentVersion: 'published',
            isViewingPublished: true,
        });

        act(() => {
            hook.result.current.saveSchedule();
        });

        expect(routerPost).toHaveBeenCalledWith(
            '/collections/7/items/42/schedule?version=published',
            { unpublish_at: null },
            expect.any(Object),
        );
    });

    it('clears the saved schedule', () => {
        const hook = renderSchedule();

        act(() => {
            hook.result.current.clearSchedule();
        });

        expect(routerPost).toHaveBeenCalledWith(
            '/collections/7/items/42/schedule?version=draft',
            { clear: true },
            expect.any(Object),
        );
    });

    it('adopts a new saved schedule from the server', () => {
        const hook = renderSchedule();

        act(() => {
            hook.result.current.setPublishAtLocal('');
        });
        hook.rerender({
            collectionId: 7,
            itemId: 42,
            publishAt: PUBLISH_AT,
            unpublishAt: UNPUBLISH_AT,
            contentVersion: 'draft',
            isViewingPublished: false,
        });

        expect(hook.result.current.publishAtLocal).not.toBe('');
        expect(hook.result.current.unpublishAtLocal).not.toBe('');
    });
});
