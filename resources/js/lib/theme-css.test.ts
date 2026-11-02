import { afterEach, describe, expect, it } from 'vitest';
import {
    applyThemeCss,
    buildPreviewThemeCss,
    THEME_STYLE_ELEMENT_ID,
} from '@/lib/theme-css';
import { themePresetBySlug } from '@/lib/theme-presets';

function computedVariable(name: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
}

afterEach(() => {
    document.getElementById(THEME_STYLE_ELEMENT_ID)?.remove();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
});

describe('applyThemeCss', () => {
    it('uses the dark preset palette in dark mode', () => {
        const indigo = themePresetBySlug('indigo');
        document.documentElement.classList.add('dark');

        applyThemeCss(buildPreviewThemeCss('indigo', null, null));

        expect(computedVariable('--background')).toBe(indigo.dark.background);
        expect(computedVariable('--primary')).toBe(indigo.dark.primary);
        expect(document.documentElement.getAttribute('style') ?? '').toBe('');
    });

    it('uses the light preset palette in light mode', () => {
        const indigo = themePresetBySlug('indigo');

        applyThemeCss(buildPreviewThemeCss('indigo', null, null));

        expect(computedVariable('--background')).toBe(indigo.light.background);
        expect(computedVariable('--primary')).toBe(indigo.light.primary);
    });

    it('rewrites the server-rendered theme block instead of adding a new one', () => {
        const serverStyle = document.createElement('style');
        serverStyle.id = THEME_STYLE_ELEMENT_ID;
        serverStyle.textContent = ':root { --brand-primary: #112233; }';
        document.head.appendChild(serverStyle);

        applyThemeCss(buildPreviewThemeCss('rose', null, null));

        expect(
            document.querySelectorAll(`#${THEME_STYLE_ELEMENT_ID}`),
        ).toHaveLength(1);
        expect(computedVariable('--brand-primary')).toBe('');
        expect(computedVariable('--primary')).toBe(
            themePresetBySlug('rose').light.primary,
        );
    });

    it('applies custom brand colours as brand variables in the style block', () => {
        document.documentElement.classList.add('dark');

        applyThemeCss(buildPreviewThemeCss('teal', '#0f172a', '#38bdf8'));

        expect(computedVariable('--brand-primary')).toBe('#0f172a');
        expect(computedVariable('--brand-primary-dark')).toBe('#38bdf8');
        expect(document.documentElement.getAttribute('style') ?? '').toBe('');
    });

    it('skips values that would break out of the declaration block', () => {
        applyThemeCss(
            buildPreviewThemeCss('teal', '#000000; } body { color: red', null),
        );

        expect(
            document.getElementById(THEME_STYLE_ELEMENT_ID)?.textContent,
        ).not.toContain('body {');
    });
});
