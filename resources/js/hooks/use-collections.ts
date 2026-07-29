import { useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import {
    useRegisterUnsavedChanges,
    useRequestLeave,
} from '@/hooks/use-unsaved-changes';
import type { CollectionRow } from '@/types/collections';

const EMPTY_COLLECTION_FORM = {
    name: '',
    slug: '',
    is_singleton: false,
};

/**
 * Converts a collection display name to a URL-safe slug.
 *
 * @param value - Raw collection name
 * @returns Slug with non-alphanumeric segments replaced by hyphens
 */
export function slugify(value: string): string {
    const s = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return s || 'collection';
}

/**
 * Manages the create/edit collection drawer form state and Inertia submit handlers.
 *
 * @returns Drawer open state, form instance, slug manual override flag, and submit helpers
 */
export function useCollections() {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CollectionRow | null>(null);
    const [slugManual, setSlugManual] = useState(false);
    const requestLeave = useRequestLeave();

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
                is_singleton: Boolean(editing.is_singleton),
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
        setOpen(false);
        setEditing(null);
        form.setDefaults({ ...EMPTY_COLLECTION_FORM });
        form.reset();
        form.clearErrors();
        setSlugManual(false);
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
            form.post(ContentCollectionController.store.url(), opts);
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
