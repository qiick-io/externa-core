/**
 * ASCII slug matching Laravel `Str::slug` defaults (separator `-`, lowercase).
 * Transliterates common accents via NFD, maps `@` → `at`, collapses non-alnum to `-`.
 */
export function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replaceAll('@', 'at')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Slugify while typing: same rules as {@link slugify}, but keeps a trailing `-`
 * when the raw input ends with a separator so multi-segment keys stay typeable.
 *
 * ponytail: trailing-sep UX ceiling — blur/submit should use {@link slugify} to match Laravel.
 */
export function slugifyInput(value: string): string {
    const keepTrailing = value.length > 0 && /[^A-Za-z0-9]$/.test(value);
    const slug = slugify(value);

    if (keepTrailing && slug !== '') {
        return `${slug}-`;
    }

    return slug;
}

/** Field key shape after slugify (hyphens) or legacy underscore keys. */
export const FIELD_KEY_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
