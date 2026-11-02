/**
 * Client-side AA checks for custom brand hex (mirrors BrandColorDerivation).
 */

const FOREGROUND_LIGHT = '#FFFFFF';
const FOREGROUND_DARK = '#0E171E';
const TEXT_CONTRAST_MIN = 4.5;
const UI_CONTRAST_MIN = 3.0;

export function brandPassesAa(
    lightHex: string | null | undefined,
    darkHex: string | null | undefined,
    lightBackground = '#FFFFFF',
    darkBackground = '#0E171E',
): boolean {
    if (lightHex) {
        const foreground = pickForeground(lightHex);

        if (
            !foreground ||
            contrastRatio(lightHex, foreground) < TEXT_CONTRAST_MIN ||
            contrastRatio(lightHex, lightBackground) < UI_CONTRAST_MIN
        ) {
            return false;
        }
    }

    const effectiveDark = darkHex || lightHex;

    if (effectiveDark && (darkHex || lightHex)) {
        const foreground = pickForeground(effectiveDark);

        if (
            !foreground ||
            contrastRatio(effectiveDark, foreground) < TEXT_CONTRAST_MIN ||
            contrastRatio(effectiveDark, darkBackground) < UI_CONTRAST_MIN
        ) {
            return false;
        }
    }

    return true;
}

function pickForeground(hex: string): string | null {
    const contrastWhite = contrastRatio(hex, FOREGROUND_LIGHT);
    const contrastInk = contrastRatio(hex, FOREGROUND_DARK);

    if (contrastWhite < TEXT_CONTRAST_MIN && contrastInk < TEXT_CONTRAST_MIN) {
        return contrastWhite >= contrastInk
            ? FOREGROUND_LIGHT
            : FOREGROUND_DARK;
    }

    if (
        contrastWhite >= TEXT_CONTRAST_MIN &&
        contrastInk >= TEXT_CONTRAST_MIN
    ) {
        return contrastWhite >= contrastInk
            ? FOREGROUND_LIGHT
            : FOREGROUND_DARK;
    }

    return contrastWhite >= TEXT_CONTRAST_MIN
        ? FOREGROUND_LIGHT
        : FOREGROUND_DARK;
}

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

function relativeLuminance(hex: string): number | null {
    const rgb = parseHex(hex);

    if (!rgb) {
        return null;
    }

    return (
        0.2126 * toLinear(rgb[0]) +
        0.7152 * toLinear(rgb[1]) +
        0.0722 * toLinear(rgb[2])
    );
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

function toLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
}
