import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@inertiajs/react', () => ({
    router: {
        on: vi.fn(),
    },
}));

vi.mock('react-i18next', () => ({
    initReactI18next: {
        type: '3rdParty',
        init: vi.fn(),
    },
}));

describe('syncDocumentLanguage', () => {
    beforeEach(() => {
        document.documentElement.lang = 'en';
    });

    it('updates documentElement.lang to the UI locale', async () => {
        const { syncDocumentLanguage } = await import('./i18n');

        syncDocumentLanguage('de');
        expect(document.documentElement.lang).toBe('de');

        syncDocumentLanguage('it_IT');
        expect(document.documentElement.lang).toBe('it-IT');
    });
});
