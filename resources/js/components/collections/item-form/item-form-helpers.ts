import type { TablePaginationLink } from '@/components/layout/page-layout';

/**
 * Shared types, constants and DOM helpers of the item create / edit page
 * (`pages/collections/items/form.tsx`). The item form is an uncontrolled
 * Inertia `<Form>`, so several helpers reach it through its DOM id.
 */

export const COLLECTION_ITEM_FORM_ID = 'collection-item-form';

export type FieldGrant = { read: boolean; create: boolean; update: boolean };

export type ItemSaveAction = 'stay' | 'create_new' | 'copy';

export type ItemView = 'fields' | 'activity';

export type ItemPayload = {
    id: number;
    data: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
    user_created?: { id: number; name: string; email?: string | null } | null;
    user_updated?: { id: number; name: string; email?: string | null } | null;
    has_draft?: boolean;
    draft_data?: Record<string, unknown> | null;
    publish_at?: string | null;
    unpublish_at?: string | null;
    published_at?: string | null;
    schedule_error?: string | null;
    schedule_failed_at?: string | null;
    approval_status?: string | null;
    rejection_note?: string | null;
    submitted_by?: number | null;
    reviewed_by?: number | null;
    reviewed_at?: string | null;
};

/** Query param that keeps the item's activity view across pagination and history (#465). */
export const ITEM_VIEW_PARAM = 'view';

/**
 * The item form element, when it is mounted.
 * @returns {HTMLFormElement | null}
 */
export function getItemFormElement(): HTMLFormElement | null {
    return document.getElementById(
        COLLECTION_ITEM_FORM_ID,
    ) as HTMLFormElement | null;
}

/**
 * Read the item view from the page URL (`?view=activity`); anything else is the edit view.
 * @param {string} pageUrl - Inertia page URL (path + query).
 * @returns {ItemView}
 */
export function readItemViewParam(pageUrl: string): ItemView {
    const queryIndex = pageUrl.indexOf('?');

    if (queryIndex === -1) {
        return 'fields';
    }

    return new URLSearchParams(pageUrl.slice(queryIndex + 1)).get(
        ITEM_VIEW_PARAM,
    ) === 'activity'
        ? 'activity'
        : 'fields';
}

/**
 * Pin activity pagination links to the activity view. The server builds them
 * on first load, before a client-side switch to `?view=activity`.
 * @param {TablePaginationLink[]} links - Laravel paginator links.
 * @returns {TablePaginationLink[]}
 */
export function withActivityViewParam(
    links: TablePaginationLink[],
): TablePaginationLink[] {
    return links.map((link) => {
        if (link.url === null) {
            return link;
        }

        const linkUrl = new URL(link.url, window.location.origin);
        linkUrl.searchParams.set(ITEM_VIEW_PARAM, 'activity');

        return { ...link, url: `${linkUrl.pathname}${linkUrl.search}` };
    });
}

/** Keys of the save shortcut, one entry per key cap. */
export function itemSaveShortcut(shift: boolean): string[] {
    const isMac =
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

    if (isMac) {
        return shift ? ['⌘', '⇧', 'S'] : ['⌘', 'S'];
    }

    return shift ? ['Ctrl', 'Shift', 'S'] : ['Ctrl', 'S'];
}

/**
 * Write the save action into the form's hidden `save_action` input, so the
 * server knows whether to stay, open a new item or copy after saving.
 * @returns {HTMLFormElement | null} The form, to submit it.
 */
export function setItemSaveAction(
    action: ItemSaveAction,
): HTMLFormElement | null {
    const form = getItemFormElement();
    const input = form?.querySelector<HTMLInputElement>(
        'input[name="save_action"]',
    );

    if (input) {
        input.value = action;
    }

    return form;
}

/** A `datetime-local` value as an ISO string; unparsable input is sent as-is. */
export function fromDatetimeLocalValue(local: string): string {
    const date = new Date(local);

    return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

/**
 * Whether the page URL deep-links to the item chat (`?chat=1` or `?comments=1`).
 */
export function isChatRequestedInUrl(pageUrl: string): boolean {
    const query = pageUrl.includes('?')
        ? pageUrl.slice(pageUrl.indexOf('?') + 1)
        : '';
    const params = new URLSearchParams(query);

    return params.get('chat') === '1' || params.get('comments') === '1';
}

/**
 * Apply current locale values to all locales (ponytail: DOM manipulation).
 * @returns {boolean} False when the form is not mounted (activity view).
 */
export function applyLocaleValuesToAll(
    globalLocale: string,
    locales: string[],
): boolean {
    const form = getItemFormElement();

    if (!form) {
        return false;
    }

    const inputs = form.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select');

    for (const input of inputs) {
        const name = input.name;
        const match = name.match(/^data\[([^\]]+)\]\[([^\]]+)\]$/);

        if (!match) {
            continue;
        }

        const [, fieldName, locale] = match;

        if (locale === globalLocale) {
            // Apply this value to all other locales
            for (const targetLocale of locales) {
                if (targetLocale === globalLocale) {
                    continue;
                }

                const targetName = `data[${fieldName}][${targetLocale}]`;
                const targetInput = form.querySelector<
                    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >(`[name="${targetName}"]`);

                if (targetInput) {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        (targetInput as HTMLInputElement).checked = (
                            input as HTMLInputElement
                        ).checked;
                    } else {
                        targetInput.value = input.value;
                    }

                    targetInput.dispatchEvent(
                        new Event('input', { bubbles: true }),
                    );
                }
            }
        }
    }

    return true;
}

/**
 * Apply current locale values to empty locales only (ponytail: DOM manipulation).
 * @returns {boolean} False when the form is not mounted (activity view).
 */
export function applyLocaleValuesToEmpty(
    globalLocale: string,
    locales: string[],
): boolean {
    const form = getItemFormElement();

    if (!form) {
        return false;
    }

    const inputs = form.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select');

    for (const input of inputs) {
        const name = input.name;
        const match = name.match(/^data\[([^\]]+)\]\[([^\]]+)\]$/);

        if (!match) {
            continue;
        }

        const [, fieldName, locale] = match;

        if (locale === globalLocale) {
            // Apply this value only to empty locales
            for (const targetLocale of locales) {
                if (targetLocale === globalLocale) {
                    continue;
                }

                const targetName = `data[${fieldName}][${targetLocale}]`;
                const targetInput = form.querySelector<
                    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >(`[name="${targetName}"]`);

                if (targetInput) {
                    const isEmpty =
                        targetInput.type === 'checkbox' ||
                        targetInput.type === 'radio'
                            ? !(targetInput as HTMLInputElement).checked
                            : (targetInput.value ?? '').trim() === '';

                    if (isEmpty) {
                        if (
                            input.type === 'checkbox' ||
                            input.type === 'radio'
                        ) {
                            (targetInput as HTMLInputElement).checked = (
                                input as HTMLInputElement
                            ).checked;
                        } else {
                            targetInput.value = input.value;
                        }

                        targetInput.dispatchEvent(
                            new Event('input', { bubbles: true }),
                        );
                    }
                }
            }
        }
    }

    return true;
}
