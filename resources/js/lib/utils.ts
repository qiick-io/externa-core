import type { InertiaLinkProps } from '@inertiajs/react';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` aware of the control-size spacing keys (#462) so a caller's
 * `h-8` / `size-7` still overrides a variant's `h-control` / `size-control`.
 */
const twMerge = extendTailwindMerge({
    extend: {
        theme: { spacing: ['control', 'control-sm', 'control-lg'] },
    },
});

/**
 * Merges Tailwind class names with conflict resolution via `tailwind-merge`.
 *
 * @param inputs - Class values accepted by `clsx`
 * @returns A single merged class string
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Normalizes an Inertia link `href` to a plain URL string.
 *
 * @param url - String href or Wayfinder-style `{ url }` object
 * @returns The URL string
 */
export function toUrl(url: NonNullable<InertiaLinkProps['href']>): string {
    return typeof url === 'string' ? url : url.url;
}
