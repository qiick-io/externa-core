import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useCollections } from '@/hooks/use-collections';
import type { CollectionRow } from '@/types/collections';

export type CollectionEditSource = Pick<
    CollectionRow,
    'id' | 'name' | 'slug' | 'is_singleton' | 'sort_order'
>;

export function useCollectionEditDrawer() {
    return useCollections();
}

export type CollectionEditDrawerProps = {
    collectionForm: ReturnType<typeof useCollections>;
};

export function CollectionEditDrawer({
    collectionForm,
}: CollectionEditDrawerProps) {
    return (
        <Drawer
            direction="right"
            open={collectionForm.open}
            onOpenChange={collectionForm.handleDrawerOpenChange}
        >
            <CollectionFormDrawer
                editing={collectionForm.editing}
                slugManual={collectionForm.slugManual}
                setSlugManual={collectionForm.setSlugManual}
                form={collectionForm.form}
                title={collectionForm.title}
                submit={collectionForm.submit}
            />
        </Drawer>
    );
}

export function CollectionEditButton({
    collectionForm,
    collection,
    variant = 'outline',
    size = 'sm',
}: {
    collectionForm: ReturnType<typeof useCollections>;
    collection: CollectionEditSource;
    variant?: 'outline' | 'default' | 'secondary' | 'ghost' | 'link' | 'destructive';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            onClick={() => {
                collectionForm.setEditing(collection);
                collectionForm.setOpen(true);
            }}
        >
            Edit collection
        </Button>
    );
}
