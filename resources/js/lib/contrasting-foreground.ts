/**
 * Picks black or white text for a solid background hex (WCAG relative luminance).
 * Mirrors App\Support\Css\ContrastingForeground for live color-picker previews.
 */
export function contrastingForeground(
    hex: string | null | undefined,
): string | null {
    const rgb = parseHex(hex);

    if (!rgb) {
        return null;
    }

    const luminance = relativeLuminance(rgb[0], rgb[1], rgb[2]);
    const contrastWhite = (1.0 + 0.05) / (luminance + 0.05);
    const contrastBlack = (luminance + 0.05) / (0.0 + 0.05);

    return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

function parseHex(
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

function relativeLuminance(r: number, g: number, b: number): number {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function toLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
}
