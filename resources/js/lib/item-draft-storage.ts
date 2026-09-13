const DRAFT_PREFIX = 'externa:item-draft:';

export function itemDraftKey(
    collectionId: number,
    itemId: number | 'new',
): string {
    return `${DRAFT_PREFIX}${collectionId}:${itemId}`;
}

/**
 * Serialize named form controls (skips files / empty unchecked checkboxes).
 */
export function serializeItemForm(
    form: HTMLFormElement,
): Record<string, string> {
    const data = new FormData(form);
    const out: Record<string, string> = {};

    for (const [key, value] of data.entries()) {
        if (typeof value !== 'string') {
            continue;
        }

        if (!key.startsWith('data')) {
            continue;
        }

        out[key] = value;
    }

    return out;
}

export function readItemDraft(
    collectionId: number,
    itemId: number | 'new',
): Record<string, string> | null {
    try {
        const raw = localStorage.getItem(itemDraftKey(collectionId, itemId));

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        return parsed as Record<string, string>;
    } catch {
        return null;
    }
}

export function writeItemDraft(
    collectionId: number,
    itemId: number | 'new',
    entries: Record<string, string>,
): void {
    try {
        localStorage.setItem(
            itemDraftKey(collectionId, itemId),
            JSON.stringify(entries),
        );
    } catch {
        // quota / private mode — ignore
    }
}

export function clearItemDraft(
    collectionId: number,
    itemId: number | 'new',
): void {
    try {
        localStorage.removeItem(itemDraftKey(collectionId, itemId));
    } catch {
        // ignore
    }
}

/**
 * Apply draft entries onto a form’s named controls.
 */
export function applyItemDraftToForm(
    form: HTMLFormElement,
    draft: Record<string, string>,
): void {
    for (const [name, value] of Object.entries(draft)) {
        const el = form.elements.namedItem(name);

        if (!el) {
            continue;
        }

        if (el instanceof RadioNodeList) {
            for (const node of el) {
                if (
                    node instanceof HTMLInputElement &&
                    node.type === 'radio' &&
                    node.value === value
                ) {
                    node.checked = true;
                }
            }

            continue;
        }

        if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') {
                el.checked =
                    value === '1' || value === 'true' || value === el.value;
            } else if (el.type !== 'file') {
                el.value = value;
            }
        } else if (
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
        ) {
            el.value = value;
        }
    }
}
