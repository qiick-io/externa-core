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

import { ItemAiDraftDialog } from '@/components/collections/item-ai-draft-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { draftValuesForForm } from '@/lib/ai-item-draft';

const fields = [
    { id: 1, name: 'title', type: 'string', settings: null },
    { id: 2, name: 'category', type: 'select', settings: null },
    { id: 3, name: 'summary', type: 'textarea', translatable: true },
];

function mockDraftResponse(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

function renderDialog(onApply = vi.fn()) {
    render(
        <TooltipProvider>
            <ItemAiDraftDialog
                collectionId={7}
                fields={fields}
                locales={['en', 'it']}
                defaultLocale="en"
                onApply={onApply}
            />
        </TooltipProvider>,
    );

    fireEvent.click(
        screen.getByRole('button', { name: 'collections.aiDraft.button' }),
    );
    fireEvent.change(screen.getByLabelText('collections.aiDraft.prompt'), {
        target: { value: 'A post about the spring release' },
    });

    return onApply;
}

describe('ItemAiDraftDialog', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('previews values and dropped fields, then fills the form only on apply', async () => {
        const fetchMock = mockDraftResponse(200, {
            data: { title: 'Spring release' },
            dropped: [{ field: 'category', reason: 'The value is invalid.' }],
        });
        const onApply = renderDialog();

        fireEvent.click(
            screen.getByRole('button', {
                name: 'collections.aiDraft.generate',
            }),
        );

        await screen.findByText('Spring release');

        expect(screen.getByText(/The value is invalid\./)).toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('/collections/7/items/ai-draft');
        expect(JSON.parse(init.body as string)).toEqual({
            prompt: 'A post about the spring release',
            locale: 'en',
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'collections.aiDraft.apply' }),
        );

        expect(onApply).toHaveBeenCalledWith({ title: 'Spring release' }, 'en');
    });

    it('shows the server error and keeps apply disabled', async () => {
        mockDraftResponse(422, {
            message: 'Invalid',
            errors: {
                prompt: ['This collection has no fields an AI draft can fill.'],
            },
        });
        const onApply = renderDialog();

        fireEvent.click(
            screen.getByRole('button', {
                name: 'collections.aiDraft.generate',
            }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'This collection has no fields an AI draft can fill.',
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', {
                    name: 'collections.aiDraft.apply',
                }),
            ).toBeDisabled(),
        );
        expect(onApply).not.toHaveBeenCalled();
    });
});

describe('draftValuesForForm', () => {
    it('keeps the other locales of translatable fields already in the form', () => {
        const form = document.createElement('form');
        form.innerHTML =
            '<input name="data[summary][en]" value="Old English" />' +
            '<input name="data[summary][it]" value="Vecchio" />';

        expect(
            draftValuesForForm(
                fields,
                { title: 'Nuovo', summary: 'Riassunto', unknown: 'x' },
                'it',
                ['en', 'it'],
                form,
            ),
        ).toEqual({
            title: 'Nuovo',
            summary: { en: 'Old English', it: 'Riassunto' },
        });
    });
});
