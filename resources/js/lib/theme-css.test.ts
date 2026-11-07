import { afterEach, describe, expect, it } from 'vitest';
import {
    applyThemeCss,
    buildPreviewThemeCss,
    THEME_STYLE_ELEMENT_ID,
} from '@/lib/theme-css';
import type {
    ThemeAiOverride,
    ThemePresetCatalogItem,
} from '@/types/appearance';

/** Minimal server-shaped presets: base surfaces + brand primary/ring. */
function presetFixture(
    slug: ThemePresetCatalogItem['slug'],
    lightPrimary: string,
    darkPrimary: string,
): ThemePresetCatalogItem {
    return {
        slug,
        name: slug,
        aiOverride: false,
        swatchLight: lightPrimary,
        swatchDark: darkPrimary,
        light: {
            background: '#FFFFFF',
            primary: lightPrimary,
            ring: lightPrimary,
        },
        dark: {
            background: '#0E171E',
            primary: darkPrimary,
            ring: darkPrimary,
        },
    };
}

const PRESETS = {
    teal: presetFixture('teal', '#0E7C86', '#2CB1BC'),
    indigo: presetFixture('indigo', '#4F46E5', '#A5B4FC'),
    rose: presetFixture('rose', '#BE185D', '#F9A8D4'),
};

const AI_OVERRIDE: ThemeAiOverride = {
    light: { ai: '#0E7C86' },
    dark: { ai: '#2CB1BC' },
    hue: 306,
    tolerance: 30,
};

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
        const indigo = PRESETS.indigo;
        document.documentElement.classList.add('dark');

        applyThemeCss(
            buildPreviewThemeCss(PRESETS.indigo, AI_OVERRIDE, null, null),
        );

        expect(computedVariable('--background')).toBe(indigo.dark.background);
        expect(computedVariable('--primary')).toBe(indigo.dark.primary);
        expect(document.documentElement.getAttribute('style') ?? '').toBe('');
    });

    it('uses the light preset palette in light mode', () => {
        const indigo = PRESETS.indigo;

        applyThemeCss(
            buildPreviewThemeCss(PRESETS.indigo, AI_OVERRIDE, null, null),
        );

        expect(computedVariable('--background')).toBe(indigo.light.background);
        expect(computedVariable('--primary')).toBe(indigo.light.primary);
    });

    it('rewrites the server-rendered theme block instead of adding a new one', () => {
        const serverStyle = document.createElement('style');
        serverStyle.id = THEME_STYLE_ELEMENT_ID;
        serverStyle.textContent = ':root { --brand-primary: #112233; }';
        document.head.appendChild(serverStyle);

        applyThemeCss(
            buildPreviewThemeCss(PRESETS.rose, AI_OVERRIDE, null, null),
        );

        expect(
            document.querySelectorAll(`#${THEME_STYLE_ELEMENT_ID}`),
        ).toHaveLength(1);
        expect(computedVariable('--brand-primary')).toBe('');
        expect(computedVariable('--primary')).toBe(PRESETS.rose.light.primary);
    });

    it('applies custom brand colours as brand variables in the style block', () => {
        document.documentElement.classList.add('dark');

        applyThemeCss(
            buildPreviewThemeCss(
                PRESETS.teal,
                AI_OVERRIDE,
                '#0f172a',
                '#38bdf8',
            ),
        );

        expect(computedVariable('--brand-primary')).toBe('#0f172a');
        expect(computedVariable('--brand-primary-dark')).toBe('#38bdf8');
        expect(document.documentElement.getAttribute('style') ?? '').toBe('');
    });

    it('falls back to the teal focus ring when the brand has under 3:1 contrast in dark mode', () => {
        document.documentElement.classList.add('dark');

        // #0f172a is ~1.1:1 on the dark background but ~17:1 on white (#453).
        const themeCss = buildPreviewThemeCss(
            PRESETS.teal,
            AI_OVERRIDE,
            '#0f172a',
            null,
        );
        applyThemeCss(themeCss);

        expect(themeCss.light.ring).toBe('#0f172a');
        expect(themeCss.dark.ring).toBe('var(--color-teal-400)');
        expect(themeCss.dark['sidebar-ring']).toBe('var(--color-teal-400)');
        expect(computedVariable('--ring')).toBe('var(--color-teal-400)');
    });

    it('falls back to the teal focus ring when the brand has under 3:1 contrast in light mode', () => {
        const themeCss = buildPreviewThemeCss(
            PRESETS.teal,
            AI_OVERRIDE,
            '#f5f5f5',
            '#38bdf8',
        );
        applyThemeCss(themeCss);

        expect(themeCss.light.ring).toBe('var(--color-teal-600)');
        expect(themeCss.dark.ring).toBe('#38bdf8');
        expect(computedVariable('--ring')).toBe('var(--color-teal-600)');
    });

    it('swaps in the AI override tokens for a custom colour near the configured AI hue', () => {
        // #8e44ad is a violet (~283° HSL), inside 306° ± 30°.
        const themeCss = buildPreviewThemeCss(
            PRESETS.teal,
            AI_OVERRIDE,
            '#8e44ad',
            null,
        );

        expect(themeCss.light.ai).toBe(AI_OVERRIDE.light.ai);
        expect(themeCss.dark.ai).toBe(AI_OVERRIDE.dark.ai);
    });

    it('skips values that would break out of the declaration block', () => {
        applyThemeCss(
            buildPreviewThemeCss(
                PRESETS.teal,
                AI_OVERRIDE,
                '#000000; } body { color: red',
                null,
            ),
        );

        expect(
            document.getElementById(THEME_STYLE_ELEMENT_ID)?.textContent,
        ).not.toContain('body {');
    });
});
