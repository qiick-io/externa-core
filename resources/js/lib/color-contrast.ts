/**
 * Hex colour maths shared by the theme preview, brand AA checks and solid
 * colour chips: hex parsing, WCAG relative luminance and contrast ratio.
 * Mirrors `App\Support\Css\ContrastingForeground` and `BrandColorDerivation`.
 */

const FOREGROUND_LIGHT = '#FFFFFF';
const FOREGROUND_DARK = '#0E171E';
const TEXT_CONTRAST_MIN = 4.5;
const UI_CONTRAST_MIN = 3.0;

/**
 * Parses `#rgb` / `#rrggbb` (with or without `#`) into 0–1 channels.
 *
 * @param hex - Colour string
 * @returns `[r, g, b]` in 0–1, or null when the value is not a hex colour
 */
export function parseHexRgb(
    hex: string | null | undefined,
): [number, number, number] | null {
    if (!hex) {
        return null;
    }

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

function toLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance of a hex colour.
 *
 * @returns 0 (black) – 1 (white), or null for an invalid colour
 */
function relativeLuminance(hex: string): number | null {
    const rgb = parseHexRgb(hex);

    if (!rgb) {
        return null;
    }

    return (
        0.2126 * toLinear(rgb[0]) +
        0.7152 * toLinear(rgb[1]) +
        0.0722 * toLinear(rgb[2])
    );
}

/**
 * WCAG contrast ratio between two hex colours (1–21; 0 when either is invalid).
 */
function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);

    if (l1 === null || l2 === null) {
        return 0;
    }

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks black or white text for a solid background hex, for live
 * colour-picker previews and coloured chips.
 *
 * @returns `#ffffff`, `#000000`, or null for an invalid colour
 */
export function contrastingForeground(
    hex: string | null | undefined,
): string | null {
    if (!hex || !parseHexRgb(hex)) {
        return null;
    }

    return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000')
        ? '#ffffff'
        : '#000000';
}

/**
 * Brand foreground (white or ink) with the better text contrast, preferring
 * one that meets AA (mirrors BrandColorDerivation).
 */
function pickBrandForeground(hex: string): string {
    const contrastWhite = contrastRatio(hex, FOREGROUND_LIGHT);
    const contrastInk = contrastRatio(hex, FOREGROUND_DARK);
    const whitePasses = contrastWhite >= TEXT_CONTRAST_MIN;
    const inkPasses = contrastInk >= TEXT_CONTRAST_MIN;

    if (whitePasses !== inkPasses) {
        return whitePasses ? FOREGROUND_LIGHT : FOREGROUND_DARK;
    }

    return contrastWhite >= contrastInk ? FOREGROUND_LIGHT : FOREGROUND_DARK;
}

/**
 * Client-side AA check for a custom brand hex pair: text on the brand meets
 * 4.5:1 and the brand meets 3:1 on the page background, in light and dark
 * (dark falls back to the light hex).
 */
export function brandPassesAa(
    lightHex: string | null | undefined,
    darkHex: string | null | undefined,
    lightBackground = '#FFFFFF',
    darkBackground = '#0E171E',
): boolean {
    const passes = (hex: string, background: string): boolean =>
        parseHexRgb(hex) !== null &&
        contrastRatio(hex, pickBrandForeground(hex)) >= TEXT_CONTRAST_MIN &&
        contrastRatio(hex, background) >= UI_CONTRAST_MIN;

    if (lightHex && !passes(lightHex, lightBackground)) {
        return false;
    }

    const effectiveDark = darkHex || lightHex;

    return !effectiveDark || passes(effectiveDark, darkBackground);
}

/**
 * Whether a colour meets the WCAG 1.4.11 non-text minimum (3:1) on a surface,
 * e.g. a focus ring on the page background (mirrors BrandColorDerivation::meetsUiContrast).
 */
export function meetsUiContrast(
    hex: string,
    surfaceBackground: string,
): boolean {
    return contrastRatio(hex, surfaceBackground) >= UI_CONTRAST_MIN;
}
