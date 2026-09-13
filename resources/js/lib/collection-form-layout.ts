/** Collection form layout presentation metadata (not a field type). */

export type FormLayoutLabel = Record<string, string>;

export type FormLayoutTab = {
    id: string;
    label: FormLayoutLabel;
};

export type FormLayoutSection = {
    id: string;
    tab_id: string | null;
    label: FormLayoutLabel;
    collapsible: boolean;
    collapsed: boolean;
    field_ids: number[];
};

export type CollectionFormLayout = {
    version: number;
    tabs: FormLayoutTab[];
    sections: FormLayoutSection[];
};

/**
 * @param raw - Raw form_layout from the collection model
 * @returns Normalized layout or null when empty / invalid
 */
export function parseCollectionFormLayout(
    raw?: Record<string, unknown> | null,
): CollectionFormLayout | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const tabs: FormLayoutTab[] = [];
    const tabIds = new Set<string>();
    const rawTabs = Array.isArray(raw.tabs) ? raw.tabs : [];

    for (const entry of rawTabs) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const tab = entry as Record<string, unknown>;
        const id = String(tab.id ?? '').trim();

        if (id === '' || tabIds.has(id)) {
            continue;
        }

        tabIds.add(id);
        tabs.push({
            id,
            label: parseLabel(tab.label),
        });
    }

    const sections: FormLayoutSection[] = [];
    const rawSections = Array.isArray(raw.sections) ? raw.sections : [];

    for (const entry of rawSections) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const section = entry as Record<string, unknown>;
        const id =
            String(section.id ?? '').trim() || `section-${sections.length + 1}`;
        let tabId =
            section.tab_id == null ? null : String(section.tab_id).trim();

        if (tabId === '' || (tabId !== null && !tabIds.has(tabId))) {
            tabId = null;
        }

        const fieldIds = Array.isArray(section.field_ids)
            ? section.field_ids
                  .map((value) => Number(value))
                  .filter((value) => Number.isFinite(value))
            : [];

        sections.push({
            id,
            tab_id: tabId,
            label: parseLabel(section.label),
            collapsible:
                section.collapsible !== false && section.collapsible !== '0',
            collapsed:
                section.collapsed === true ||
                section.collapsed === 1 ||
                section.collapsed === '1',
            field_ids: fieldIds,
        });
    }

    if (tabs.length === 0 && sections.length === 0) {
        return null;
    }

    return {
        version: 1,
        tabs,
        sections,
    };
}

function parseLabel(value: unknown): FormLayoutLabel {
    if (typeof value === 'string' && value.trim() !== '') {
        return { en: value.trim() };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const out: FormLayoutLabel = {};

    for (const [locale, text] of Object.entries(
        value as Record<string, unknown>,
    )) {
        if (typeof text === 'string' && text.trim() !== '') {
            out[locale] = text.trim();
        }
    }

    return out;
}

/**
 * Resolve a layout label for the active content locales.
 */
export function resolveFormLayoutLabel(
    label: FormLayoutLabel,
    locales: string[],
    fallback = 'Section',
): string {
    for (const locale of locales) {
        const value = label[locale];

        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    const first = Object.values(label).find(
        (value) => typeof value === 'string' && value.trim() !== '',
    );

    return first?.trim() || fallback;
}

/**
 * Build render groups: each section plus leftover fields not placed in layout.
 */
export function resolveFormLayoutGroups<T extends { id: number }>(
    layout: CollectionFormLayout | null,
    fields: T[],
): Array<{ section: FormLayoutSection | null; fields: T[] }> {
    if (!layout || layout.sections.length === 0) {
        return [{ section: null, fields }];
    }

    const byId = new Map(fields.map((field) => [field.id, field]));
    const placed = new Set<number>();
    const groups: Array<{ section: FormLayoutSection | null; fields: T[] }> =
        [];

    for (const section of layout.sections) {
        const sectionFields: T[] = [];

        for (const fieldId of section.field_ids) {
            const field = byId.get(fieldId);

            if (!field || placed.has(fieldId)) {
                continue;
            }

            placed.add(fieldId);
            sectionFields.push(field);
        }

        groups.push({ section, fields: sectionFields });
    }

    const leftover = fields.filter((field) => !placed.has(field.id));

    if (leftover.length > 0) {
        groups.push({
            section: {
                id: 'unsectioned',
                tab_id: null,
                label: { en: 'Other' },
                collapsible: false,
                collapsed: false,
                field_ids: leftover.map((field) => field.id),
            },
            fields: leftover,
        });
    }

    return groups;
}

export function newFormLayoutId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
