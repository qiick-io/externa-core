/**
 * Responsive image URLs for large file-field previews (cover, etc.).
 * Keep free of `@/` imports so node self-checks can run.
 */

export type FileFieldImageFile = {
    type?: string;
    url?: string | null;
    storage_path?: string | null;
    thumbnail_url?: string | null;
};

/**
 * Set or replace a query param without requiring an absolute URL.
 */
export function withSearchParam(
    url: string,
    key: string,
    value: string,
): string {
    const hashIndex = url.indexOf('#');
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const queryIndex = withoutHash.indexOf('?');
    const base =
        queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const params = new URLSearchParams(
        queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '',
    );
    params.set(key, value);
    const query = params.toString();

    return `${base}?${query}${hash}`;
}

function resolvePublicUrl(file: FileFieldImageFile): string | null {
    if (file.url) {
        return file.url;
    }

    if (!file.storage_path || file.type !== 'file') {
        return null;
    }

    return `/storage/assets/${file.storage_path}`;
}

/** Layout hint for image/file field slots (half or full column, mobile full). */
export const FILE_FIELD_IMAGE_SIZES =
    '(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 36rem';

/**
 * Thumb 128/256 + original. Wide/retina slots pick original (thumb max ~256).
 */
export function fileFieldImageSources(file: FileFieldImageFile): {
    src: string;
    srcSet?: string;
    sizes: string;
} | null {
    const full = resolvePublicUrl(file);
    const thumb = file.thumbnail_url ?? null;

    if (!full && !thumb) {
        return null;
    }

    if (!thumb) {
        return { src: full as string, sizes: FILE_FIELD_IMAGE_SIZES };
    }

    const thumb128 = withSearchParam(thumb, 'size', '128');
    const thumb256 = withSearchParam(thumb, 'size', '256');

    if (!full) {
        return {
            src: thumb256,
            srcSet: `${thumb128} 128w, ${thumb256} 256w`,
            sizes: FILE_FIELD_IMAGE_SIZES,
        };
    }

    return {
        src: thumb256,
        srcSet: `${thumb128} 128w, ${thumb256} 256w, ${full} 1600w`,
        sizes: FILE_FIELD_IMAGE_SIZES,
    };
}
