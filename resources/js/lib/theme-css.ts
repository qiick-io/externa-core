import { meetsUiContrast } from '@/lib/brand-contrast';
import { contrastingForeground } from '@/lib/contrasting-foreground';
import type { ThemePresetTokens } from '@/lib/theme-presets';
import type {
    ThemeAiOverride,
    ThemeCssPayload,
    ThemePresetCatalogItem,
} from '@/types/appearance';

const BRAND_LINKED_KEYS = [
    'primary',
    'primary-foreground',
    'ring',
    'chart-1',
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-ring',
] as const;

/**
 * Contrast-safe focus rings (#227) used when the brand colour is below 3:1 on
 * the page background (#453). Mirrors ThemePresetService and app.css.
 */
const FALLBACK_RING_LIGHT = 'var(--color-teal-600)';
const FALLBACK_RING_DARK = 'var(--color-teal-400)';

/** Id of the theme `<style>` element rendered by `app.blade.php`. */
export const THEME_STYLE_ELEMENT_ID = 'externa-theme-css';

/** Rejects values that could close the declaration block (`;`, `{`, `}`, `<`). */
const SAFE_CSS_VALUE = /^[^;{}<>]+$/;

/**
 * Apply resolved theme CSS variables to the document for live preview.
 *
 * Rewrites the same `<style id="externa-theme-css">` the server renders, as a
 * `:root { … }` light block and a `.dark { … }` block. Nothing is set inline on
 * `<html>`, so the `.dark` (and `html.high-contrast`) rules keep winning in
 * dark mode. Side effect: creates the style element in `<head>` if missing.
 */
export function applyThemeCss(themeCss: ThemeCssPayload): void {
    let styleElement = document.getElementById(
        THEME_STYLE_ELEMENT_ID,
    ) as HTMLStyleElement | null;

    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = THEME_STYLE_ELEMENT_ID;
        document.head.appendChild(styleElement);
    }

    const lightDeclarations: Record<string, string> = { ...themeCss.light };

    if (themeCss.brandPrimary) {
        const brandPrimaryDark =
            themeCss.brandPrimaryDark ?? themeCss.brandPrimary;

        lightDeclarations['brand-primary'] = themeCss.brandPrimary;
        lightDeclarations['brand-primary-foreground'] =
            themeCss.brandPrimaryForeground ??
            contrastingForeground(themeCss.brandPrimary) ??
            '#ffffff';
        lightDeclarations['brand-primary-dark'] = brandPrimaryDark;
        lightDeclarations['brand-primary-dark-foreground'] =
            themeCss.brandPrimaryDarkForeground ??
            contrastingForeground(brandPrimaryDark) ??
            '#ffffff';
    }

    styleElement.textContent = [
        `:root { ${cssDeclarations(lightDeclarations)} }`,
        `.dark { ${cssDeclarations(themeCss.dark)} }`,
    ].join('\n');
}

function cssDeclarations(tokens: ThemePresetTokens): string {
    return Object.entries(tokens)
        .filter(([, value]) => SAFE_CSS_VALUE.test(value))
        .map(([key, value]) => `--${key}: ${value};`)
        .join(' ');
}

/**
 * Build a ThemeCssPayload client-side for appearance form live preview, from
 * the server-resolved preset tokens (no client copy of the presets).
 */
export function buildPreviewThemeCss(
    preset: ThemePresetCatalogItem,
    aiOverride: ThemeAiOverride,
    projectColor: string | null,
    projectColorDark: string | null,
): ThemeCssPayload {
    let light: ThemePresetTokens = { ...preset.light };
    let dark: ThemePresetTokens = { ...preset.dark };

    const appliesAiOverride =
        preset.aiOverride ||
        isNearAiHue(projectColor, aiOverride) ||
        isNearAiHue(projectColorDark, aiOverride);

    if (appliesAiOverride) {
        light = { ...light, ...aiOverride.light };
        dark = { ...dark, ...aiOverride.dark };
    }

    const hasCustomLight = Boolean(projectColor);
    const hasCustomDark = Boolean(projectColorDark);
    const effectiveDark = hasCustomDark
        ? projectColorDark
        : hasCustomLight
          ? projectColor
          : null;

    let brandPrimaryForeground: string | null = null;
    let brandPrimaryDarkForeground: string | null = null;

    if (hasCustomLight && projectColor) {
        brandPrimaryForeground = contrastingForeground(projectColor);
        light = {
            ...stripBrandLinkedKeys(light),
            ...ringTokens(
                projectColor,
                light.background ?? '#FFFFFF',
                FALLBACK_RING_LIGHT,
            ),
        };
    }

    if (effectiveDark && (hasCustomLight || hasCustomDark)) {
        brandPrimaryDarkForeground = contrastingForeground(effectiveDark);
        dark = {
            ...stripBrandLinkedKeys(dark),
            ...ringTokens(
                effectiveDark,
                dark.background ?? '#0E171E',
                FALLBACK_RING_DARK,
            ),
        };
    }

    return {
        light,
        dark,
        brandPrimary: hasCustomLight ? projectColor : null,
        brandPrimaryDark:
            hasCustomLight || hasCustomDark ? effectiveDark : null,
        brandPrimaryForeground,
        brandPrimaryDarkForeground,
    };
}

/**
 * Focus ring tokens for a custom brand: the brand when it keeps 3:1 on the page
 * background, else the teal fallback. Always set so a light ring cannot leak
 * into `.dark` through the `:root` block.
 */
function ringTokens(
    brandHex: string,
    background: string,
    fallbackRing: string,
): ThemePresetTokens {
    const ring = meetsUiContrast(brandHex, background)
        ? brandHex
        : fallbackRing;

    return { ring, 'sidebar-ring': ring };
}

function stripBrandLinkedKeys(tokens: ThemePresetTokens): ThemePresetTokens {
    const next = { ...tokens };

    for (const key of BRAND_LINKED_KEYS) {
        delete next[key];
    }

    return next;
}

/**
 * Approximate AI-accent hue proximity (configured hue ± tolerance) using HSL hue as a preview hint.
 * Server-side OKLCH check is authoritative.
 */
function isNearAiHue(
    hex: string | null | undefined,
    aiOverride: ThemeAiOverride,
): boolean {
    if (!hex) {
        return false;
    }

    const rgb = parseHex(hex);

    if (!rgb) {
        return false;
    }

    const hue = rgbToHue(rgb[0], rgb[1], rgb[2]);

    if (hue === null) {
        return false;
    }

    const delta = Math.abs(hue - aiOverride.hue) % 360;

    return Math.min(delta, 360 - delta) <= aiOverride.tolerance;
}

function parseHex(hex: string): [number, number, number] | null {
    let value = hex.trim().replace(/^#/, '');

    if (value.length === 3 && /^[0-9a-fA-F]{3}$/.test(value)) {
        value = value
            .split('')
            .map((ch) => ch + ch)
            .join('');
    }

    if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) {
        return null;
    }

    return [
        Number.parseInt(value.slice(0, 2), 16) / 255,
        Number.parseInt(value.slice(2, 4), 16) / 255,
        Number.parseInt(value.slice(4, 6), 16) / 255,
    ];
}

function rgbToHue(r: number, g: number, b: number): number | null {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;

    if (chroma < 0.0001) {
        return null;
    }

    let hue = 0;

    if (max === r) {
        hue = ((g - b) / chroma) % 6;
    } else if (max === g) {
        hue = (b - r) / chroma + 2;
    } else {
        hue = (r - g) / chroma + 4;
    }

    hue *= 60;

    if (hue < 0) {
        hue += 360;
    }

    return hue;
}
