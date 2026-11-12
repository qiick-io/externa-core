import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: vi.fn() },
}));

import { ItemLivePreviewButton } from '@/components/collections/item-live-preview-button';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderCreateFormButton() {
    return render(
        <TooltipProvider>
            <form id="item-form">
                <input name="data[title]" defaultValue="Unsaved title" />
            </form>
            <ItemLivePreviewButton
                collectionId={7}
                itemId={null}
                formId="item-form"
                version="draft"
            />
        </TooltipProvider>,
    );
}

describe('ItemLivePreviewButton on the create form', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('posts the unsaved form values, opens the preview and revokes it on leave', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ url: 'https://front.test/p?token=abc' }),
        });
        const openMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('open', openMock);

        const { unmount } = renderCreateFormButton();

        expect(
            screen.queryByRole('button', {
                name: 'collections.itemToolbar.livePreviewAt',
            }),
        ).toBeNull();

        fireEvent.click(
            screen.getByRole('button', {
                name: 'collections.itemToolbar.livePreviewUnsaved',
            }),
        );

        await waitFor(() =>
            expect(openMock).toHaveBeenCalledWith(
                'https://front.test/p?token=abc',
                '_blank',
                'noopener,noreferrer',
            ),
        );

        const [storeUrl, storeInit] = fetchMock.mock.calls[0] as [
            string,
            RequestInit,
        ];

        expect(storeUrl).toBe('/collections/7/items/live-preview-draft');
        expect(storeInit.method).toBe('POST');
        expect((storeInit.body as FormData).get('data[title]')).toBe(
            'Unsaved title',
        );

        unmount();

        const [revokeUrl, revokeInit] = fetchMock.mock.calls[1] as [
            string,
            RequestInit,
        ];

        expect(revokeUrl).toBe('/collections/7/items/live-preview-draft');
        expect(revokeInit.method).toBe('DELETE');
        expect(revokeInit.keepalive).toBe(true);
    });

    it('does not revoke anything when no preview was opened', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { unmount } = renderCreateFormButton();
        unmount();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
