import { contrastingForeground } from '@/lib/contrasting-foreground';
import {
    AI_OVERRIDE_DARK,
    AI_OVERRIDE_LIGHT,
    themePresetBySlug,
} from '@/lib/theme-presets';
import type { ThemePresetSlug, ThemePresetTokens } from '@/lib/theme-presets';
import type { ThemeCssPayload } from '@/types/appearance';

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
 * Apply resolved theme CSS variables to the document for live preview.
 */
export function applyThemeCss(themeCss: ThemeCssPayload): void {
    const root = document.documentElement;

    clearThemeInlineVars(root);

    for (const [key, value] of Object.entries(themeCss.light)) {
        root.style.setProperty(`--${key}`, value);
    }

    // Dark tokens are applied under .dark via a style tag so light preview stays clean.
    ensureDarkThemeStyle(themeCss.dark);

    if (themeCss.brandPrimary) {
        root.style.setProperty('--brand-primary', themeCss.brandPrimary);
        root.style.setProperty(
            '--brand-primary-foreground',
            themeCss.brandPrimaryForeground ??
                contrastingForeground(themeCss.brandPrimary) ??
                '#ffffff',
        );
        root.style.setProperty(
            '--brand-primary-dark',
            themeCss.brandPrimaryDark ?? themeCss.brandPrimary,
        );
        root.style.setProperty(
            '--brand-primary-dark-foreground',
            themeCss.brandPrimaryDarkForeground ??
                contrastingForeground(
                    themeCss.brandPrimaryDark ?? themeCss.brandPrimary,
                ) ??
                '#ffffff',
        );
    } else {
        root.style.removeProperty('--brand-primary');
        root.style.removeProperty('--brand-primary-foreground');
        root.style.removeProperty('--brand-primary-dark');
        root.style.removeProperty('--brand-primary-dark-foreground');
    }
}

/**
 * Build a ThemeCssPayload client-side for appearance form live preview.
 */
export function buildPreviewThemeCss(
    themePreset: ThemePresetSlug,
    projectColor: string | null,
    projectColorDark: string | null,
): ThemeCssPayload {
    const preset = themePresetBySlug(themePreset);
    let light: ThemePresetTokens = { ...preset.light };
    let dark: ThemePresetTokens = { ...preset.dark };

    const aiOverride =
        preset.aiOverride ||
        isNearAiHue(projectColor) ||
        isNearAiHue(projectColorDark);

    if (aiOverride) {
        light = { ...light, ...AI_OVERRIDE_LIGHT };
        dark = { ...dark, ...AI_OVERRIDE_DARK };
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
        light = stripBrandLinkedKeys(light);
    }

    if (effectiveDark && (hasCustomLight || hasCustomDark)) {
        brandPrimaryDarkForeground = contrastingForeground(effectiveDark);
        dark = stripBrandLinkedKeys(dark);
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

function stripBrandLinkedKeys(tokens: ThemePresetTokens): ThemePresetTokens {
    const next = { ...tokens };

    for (const key of BRAND_LINKED_KEYS) {
        delete next[key];
    }

    return next;
}

function clearThemeInlineVars(root: HTMLElement): void {
    const keys = [
        'background',
        'foreground',
        'card',
        'card-foreground',
        'popover',
        'popover-foreground',
        'primary',
        'primary-foreground',
        'secondary',
        'secondary-foreground',
        'muted',
        'muted-foreground',
        'accent',
        'accent-foreground',
        'destructive',
        'destructive-foreground',
        'border',
        'input',
        'ring',
        'chart-1',
        'chart-2',
        'chart-3',
        'chart-4',
        'chart-5',
        'sidebar',
        'sidebar-foreground',
        'sidebar-primary',
        'sidebar-primary-foreground',
        'sidebar-accent',
        'sidebar-accent-foreground',
        'sidebar-border',
        'sidebar-ring',
        'ai',
        'ai-hover',
        'ai-foreground',
        'ai-bg',
        'ai-text',
        'ai-border',
    ];

    for (const key of keys) {
        root.style.removeProperty(`--${key}`);
    }
}

function ensureDarkThemeStyle(darkTokens: ThemePresetTokens): void {
    const styleId = 'externa-theme-preset-dark-preview';
    let styleElement = document.getElementById(
        styleId,
    ) as HTMLStyleElement | null;

    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }

    const declarations = Object.entries(darkTokens)
        .map(([key, value]) => `--${key}: ${value};`)
        .join(' ');

    styleElement.textContent = `.dark { ${declarations} }`;
}

/**
 * Approximate AI-accent hue proximity (±30° of ~306°) using HSL hue as a preview hint.
 * Server-side OKLCH check is authoritative.
 */
function isNearAiHue(hex: string | null | undefined): boolean {
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

    const delta = Math.abs(hue - 306) % 360;

    return Math.min(delta, 360 - delta) <= 30;
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
