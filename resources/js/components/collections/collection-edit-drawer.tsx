import { Pencil } from 'lucide-react';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { Drawer } from '@/components/ui/drawer';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCollections } from '@/hooks/use-collections';
import type { CollectionRow } from '@/types/collections';

export type CollectionEditSource = Pick<
    CollectionRow,
    | 'id'
    | 'name'
    | 'slug'
    | 'description'
    | 'status'
    | 'icon'
    | 'color'
    | 'is_singleton'
    | 'versioning'
    | 'revision_retention_count'
    | 'revision_retention_days'
    | 'sort_order'
>;

/**
 * Hook exposing open/close state for collection edit drawer.
 * @returns {Object}
 */
export function useCollectionEditDrawer() {
    return useCollections();
}

export type CollectionEditDrawerProps = {
    collectionForm: ReturnType<typeof useCollections>;
};

/**
 * Drawer shell for editing collection metadata.
 * @returns {JSX.Element}
 */
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
                onCancel={() => collectionForm.handleDrawerOpenChange(false)}
            />
        </Drawer>
    );
}

/**
 * Button that opens the collection edit drawer.
 * @returns {JSX.Element | null}
 */
export function CollectionEditButton({
    collectionForm,
    collection,
    variant = 'outline',
}: {
    collectionForm: ReturnType<typeof useCollections>;
    collection: CollectionEditSource;
    variant?:
        'outline' | 'default' | 'secondary' | 'ghost' | 'link' | 'destructive';
}) {
    const { can } = useCan();

    if (!can(PermissionEnum.CanEditCollections)) {
        return null;
    }

    return (
        <HeaderIconButton
            type="button"
            variant={variant}
            label="Edit collection"
            onClick={() => {
                collectionForm.setEditing(collection);
                collectionForm.setOpen(true);
            }}
        >
            <Pencil className="size-4" />
        </HeaderIconButton>
    );
}
