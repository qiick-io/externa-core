import { useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import {
    useRegisterUnsavedChanges,
    useRequestLeave,
} from '@/hooks/use-unsaved-changes';
import { slugify as toSlug } from '@/lib/slugify';
import type { CollectionRow } from '@/types/collections';

const EMPTY_COLLECTION_FORM = {
    name: '',
    slug: '',
    description: '',
    status: 'active' as const,
    icon: '',
    color: '',
    is_singleton: false,
    versioning: false,
    revision_retention_count: null as number | null,
    revision_retention_days: null as number | null,
};

/** Empty / invalid → null (unlimited). */
function retentionOrNull(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : null;
}

/**
 * Converts a collection display name to a URL-safe slug.
 *
 * @param value - Raw collection name
 * @returns Slug with non-alphanumeric segments replaced by hyphens
 */
export function slugify(value: string): string {
    return toSlug(value);
}

/**
 * Manages the create/edit collection drawer form state and Inertia submit handlers.
 *
 * @returns Drawer open state, form instance, slug manual override flag, and submit helpers
 */
export function useCollections(options?: { onClosed?: () => void }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CollectionRow | null>(null);
    const [slugManual, setSlugManual] = useState(false);
    const requestLeave = useRequestLeave();
    const onClosed = options?.onClosed;

    const form = useForm({ ...EMPTY_COLLECTION_FORM });

    useRegisterUnsavedChanges({
        scope: 'drawer',
        isDirty: form.isDirty,
        enabled: open,
        onDiscard: () => {
            form.reset();
            form.clearErrors();
        },
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        if (editing) {
            // Fresh object for setDefaults — avoid sharing the setData reference
            // (Inertia setDefaults() with no args stores dataRef as defaults).
            const payload = {
                name: editing.name,
                slug: editing.slug,
                description: editing.description ?? '',
                status: (editing.status ?? 'active') as 'active' | 'inactive',
                icon: editing.icon ?? '',
                color: editing.color ?? '',
                is_singleton: Boolean(editing.is_singleton),
                versioning: Boolean(editing.versioning),
                revision_retention_count:
                    editing.revision_retention_count ?? null,
                revision_retention_days:
                    editing.revision_retention_days ?? null,
            };
            form.setData(payload);
            form.setDefaults({ ...payload });
            setSlugManual(true);
        } else {
            form.setDefaults({ ...EMPTY_COLLECTION_FORM });
            form.reset();
            form.clearErrors();
            setSlugManual(false);
        }
        /* `form` omitted from deps: Inertia useForm identity can change every render */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing]);

    const title = editing ? 'Edit collection' : 'New collection';

    const closeDrawer = (): void => {
        // flushSync: clear dirty + unregister before onClosed deep-link GET,
        // otherwise the leave guard still sees the form as dirty (same as
        // collection-field-form save success).
        flushSync(() => {
            setOpen(false);
            setEditing(null);
            form.setDefaults({ ...EMPTY_COLLECTION_FORM });
            form.reset();
            form.clearErrors();
            setSlugManual(false);
        });
        onClosed?.();
    };

    const submit = (): void => {
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                closeDrawer();
            },
        };

        if (editing) {
            form.transform((data) => ({
                name: data.name,
                slug: data.slug,
                description: data.description || null,
                status: data.status,
                icon: data.icon || null,
                color: data.color || null,
                versioning: Boolean(data.versioning),
                revision_retention_count: retentionOrNull(
                    data.revision_retention_count,
                ),
                revision_retention_days: retentionOrNull(
                    data.revision_retention_days,
                ),
            }));
            form.put(
                ContentCollectionController.update.url({
                    collection: editing.id,
                }),
                {
                    ...opts,
                    onFinish: () => {
                        form.transform((data) => data);
                    },
                },
            );
        } else {
            form.transform((data) => ({
                ...data,
                description: data.description || null,
                icon: data.icon || null,
                color: data.color || null,
                revision_retention_count: retentionOrNull(
                    data.revision_retention_count,
                ),
                revision_retention_days: retentionOrNull(
                    data.revision_retention_days,
                ),
            }));
            form.post(ContentCollectionController.store.url(), {
                ...opts,
                onFinish: () => {
                    form.transform((data) => data);
                },
            });
        }
    };

    /**
     * Handles drawer open/close; clears editing state when the drawer closes.
     *
     * @param next - Whether the drawer should be open
     * @returns {void}
     */
    const handleDrawerOpenChange = (next: boolean): void => {
        if (next) {
            setOpen(true);

            return;
        }

        void requestLeave().then((ok) => {
            if (!ok) {
                return;
            }

            closeDrawer();
        });
    };

    return {
        open,
        setOpen,
        editing,
        setEditing,
        slugManual,
        setSlugManual,
        form,
        title,
        submit,
        handleDrawerOpenChange,
    };
}

export type UseCollectionsReturn = ReturnType<typeof useCollections>;
