import { useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Cms/ContentCollectionController';
import type { CollectionRow } from '@/types/cms-collections';

export function slugify(value: string): string {
    const s = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return s || 'collection';
}

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
        // Omit `form` from deps: Inertia useForm's object identity can change every render and retrigger this effect (infinite updates).
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
            form.put(
                ContentCollectionController.update.url({
                    collection: editing.id,
                }),
                opts,
            );
        } else {
            form.post(ContentCollectionController.store.url(), opts);
        }
    };

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
