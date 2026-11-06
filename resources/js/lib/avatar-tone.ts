/**
 * Per-user avatar colour, kept outside the shadcn `avatar` so that component stays
 * unchanged. Pass the result to `AvatarFallback`'s `className` (and to a sender name)
 * where users must be told apart: chat, presence, group members.
 *
 * Swatches are the theme's `avatar-1` … `avatar-10` tokens, written as literal classes so
 * Tailwind generates them. Colour is never the only cue: pair it with the name.
 *
 * @example <AvatarFallback className={avatarToneClass(user.id)}>EM</AvatarFallback>
 */
const AVATAR_TONES = [
    'bg-avatar-1 text-avatar-foreground',
    'bg-avatar-2 text-avatar-foreground',
    'bg-avatar-3 text-avatar-foreground',
    'bg-avatar-4 text-avatar-foreground',
    'bg-avatar-5 text-avatar-foreground',
    'bg-avatar-6 text-avatar-foreground',
    'bg-avatar-7 text-avatar-foreground',
    'bg-avatar-8 text-avatar-foreground',
    'bg-avatar-9 text-avatar-foreground',
    'bg-avatar-10 text-avatar-foreground',
];

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
 * Stable swatch class for a user (or group) id: numeric ids use abs(id) % 10,
 * other strings are hashed first. Undefined when there is no id.
 */
export function avatarToneClass(
    id?: number | string | null,
): string | undefined {
    if (id === undefined || id === null) {
        return undefined;
    }

    const seed = seedFromId(id);

    return seed === null
        ? AVATAR_TONES[0]
        : AVATAR_TONES[Math.abs(seed) % AVATAR_TONES.length];
}
