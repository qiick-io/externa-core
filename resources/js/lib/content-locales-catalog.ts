import catalogJson from '../../data/content-locales-catalog.json';

export type ContentLocaleCatalogEntry = {
    code: string;
    name: string;
    flag: string;
};

/** Content locale catalog (static, in-repo). */
const CONTENT_LOCALES_CATALOG: ContentLocaleCatalogEntry[] =
    catalogJson as ContentLocaleCatalogEntry[];

const byCode = new Map(
    CONTENT_LOCALES_CATALOG.map((entry) => [entry.code, entry]),
);

/**
 * Resolve catalog metadata for a locale code.
 */
export function contentLocaleMeta(code: string): ContentLocaleCatalogEntry {
    return (
        byCode.get(code) ?? {
            code,
            name: code,
            flag: code.includes('-')
                ? (code.split('-')[1]?.toUpperCase() ?? 'UN')
                : code.toUpperCase(),
        }
    );
}
