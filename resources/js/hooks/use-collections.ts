import { useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import type { CollectionRow } from '@/types/collections';

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

    const form = useForm({
        name: '',
        slug: '',
        is_singleton: false,
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        if (editing) {
            form.setData({
                name: editing.name,
                slug: editing.slug,
                is_singleton: editing.is_singleton,
            });
            setSlugManual(true);
        } else {
            form.reset();
            form.clearErrors();
            setSlugManual(false);
        }
        /* `form` omitted from deps: Inertia useForm identity can change every render */
    }, [open, editing]);

    const title = editing ? 'Edit collection' : 'New collection';

    const submit = (): void => {
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                setOpen(false);
                setEditing(null);
                form.reset();
                setSlugManual(false);
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
        setOpen(next);

        if (!next) {
            setEditing(null);
        }
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
