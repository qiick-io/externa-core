import { afterEach, describe, expect, it } from 'vite-plus/test';
import { focusPageMain } from '@/lib/focus-page-main';

describe('focusPageMain', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('focuses #main-content when focus is on body', () => {
        document.body.innerHTML =
            '<main id="main-content" tabindex="-1">Content</main>';
        document.body.focus();

        expect(focusPageMain()).toBe(true);
        expect(document.activeElement?.id).toBe('main-content');
    });

    it('does not steal focus from an interactive control', () => {
        document.body.innerHTML = `
            <main id="main-content" tabindex="-1">Content</main>
            <button id="action" type="button">Action</button>
        `;
        const button = document.getElementById('action');
        button?.focus();

        expect(focusPageMain()).toBe(false);
        expect(document.activeElement?.id).toBe('action');
    });

    it('forces focus when requested', () => {
        document.body.innerHTML = `
            <main id="main-content" tabindex="-1">Content</main>
            <button id="action" type="button">Action</button>
        `;
        document.getElementById('action')?.focus();

        expect(focusPageMain({ force: true })).toBe(true);
        expect(document.activeElement?.id).toBe('main-content');
    });
});
