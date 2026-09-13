/**
 * Filegrant pastel set (`getAvatarColor` in `src/utils/avatarColors/avatarColors.ts`).
 * Same id always maps to the same swatch via modulo.
 */
export const AVATAR_COLORS: string[] = [
    '#D4A5C7',
    '#8FC4A3',
    '#7BAFD4',
    '#D4C17A',
    '#D4A574',
    '#B8A5D4',
    '#D49A9A',
    '#7FB8A8',
    '#C4A5B8',
    '#9FA5C7',
];

const FALLBACK = AVATAR_COLORS[0] ?? '#D4A5C7';

function seedFromId(id: number | string): number | null {
    if (typeof id === 'number') {
        return Number.isNaN(id) ? null : id;
    }

    const trimmed = id.trim();

    if (trimmed === '') {
        return null;
    }

    const asNumber = Number(trimmed);

    if (Number.isFinite(asNumber)) {
        return asNumber;
    }

    let hash = 0;

    for (let i = 0; i < trimmed.length; i++) {
        hash = (Math.imul(31, hash) + trimmed.charCodeAt(i)) | 0;
    }

    return hash;
}

/**
 * Stable palette color for a user (or group) id. Numeric ids use abs(id) % n
 * like Filegrant; non-numeric strings hash first.
 */
export function avatarColorForId(id: number | string): string {
    const seed = seedFromId(id);

    if (seed === null) {
        return FALLBACK;
    }

    return AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length] ?? FALLBACK;
}

/**
 * Initials color for a solid hex background.
 * Filegrant `getContrastColorForBackground` (luminance > 0.4 → dark).
 */
export function avatarTextColor(backgroundColorHex: string): string {
    const hex = backgroundColorHex.replace(/^#/, '');

    if (hex.length !== 3 && hex.length !== 6) {
        return '#ffffff';
    }

    let r: number;
    let g: number;
    let b: number;

    if (hex.length === 3) {
        r = Number.parseInt(hex[0]! + hex[0], 16) / 255;
        g = Number.parseInt(hex[1]! + hex[1], 16) / 255;
        b = Number.parseInt(hex[2]! + hex[2], 16) / 255;
    } else {
        r = Number.parseInt(hex.slice(0, 2), 16) / 255;
        g = Number.parseInt(hex.slice(2, 4), 16) / 255;
        b = Number.parseInt(hex.slice(4, 6), 16) / 255;
    }

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    return luminance > 0.4 ? '#1f2937' : '#ffffff';
}

/** Background + contrasting initials color for inline `style`. */
export function avatarStyleForId(id: number | string): {
    backgroundColor: string;
    color: string;
} {
    const backgroundColor = avatarColorForId(id);

    return {
        backgroundColor,
        color: avatarTextColor(backgroundColor),
    };
}
