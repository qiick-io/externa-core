import { Head } from '@inertiajs/react';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import {
    CollectionFieldFormDrawer,
    CollectionFieldTypeDrawer,
} from '@/components/collections/collection-field-form';
import { CollectionFieldsList } from '@/components/collections/collection-fields-list';
import { CollectionFormLayoutEditor } from '@/components/collections/collection-form-layout-editor';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerNested } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import {
    fieldTypeLabel
} from '@/lib/collection-field-types';
import type {RelatedCollectionOption} from '@/lib/collection-field-types';
import collections from '@/routes/collections';
import type { BreadcrumbItem, CollectionFieldRow } from '@/types';
import { collectionToFormRow } from '@/types';
import type { CollectionView } from '@/types/collections';

/**
 * Field schema editor for a collection.
 * @returns {JSX.Element}
 */
export default function CollectionsFields({
    collection,
    relatedCollections = [],
}: {
    collection: CollectionView;
    relatedCollections?: RelatedCollectionOption[];
}) {
    const { can } = useCan();
    const canEditSchema = can(PermissionEnum.CanEditCollections);
    const [addOpen, setAddOpen] = useState(false);
    const [addFormOpen, setAddFormOpen] = useState(false);
    const [addFieldType, setAddFieldType] = useState('string');
    const [editField, setEditField] = useState<CollectionFieldRow | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Collections', href: collections.index.url() },
            {
                title: collection.name,
                href: collection.is_singleton
                    ? collections.show.url(collection.id)
                    : collections.items.index.url(collection.id),
            },
            {
                title: 'Fields',
                href: FieldController.index.url(collection.id),
            },
        ],
        [collection.id, collection.name, collection.is_singleton],
    );

    const collectionForm = useCollectionEditDrawer();
    const fields = collection.fields;

    const filteredFields = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        if (query === '') {
            return fields;
        }

        return fields.filter(
            (field) =>
                field.name.toLowerCase().includes(query) ||
                field.type.toLowerCase().includes(query) ||
                fieldTypeLabel(field.type).toLowerCase().includes(query),
        );
    }, [fields, searchQuery]);

    const searchQueryActive = searchQuery.trim() !== '';

    const openEdit = (field: CollectionFieldRow): void => {
        setEditField(field);
    };

    const openAdd = (): void => {
        setAddFieldType('string');
        setAddFormOpen(false);
        setAddOpen(true);
    };

    const closeAddFlow = (): void => {
        setAddFormOpen(false);
        setAddOpen(false);
        setAddFieldType('string');
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    <CollectionEditButton
                        collectionForm={collectionForm}
                        collection={collectionToFormRow(collection)}
                    />
                    {canEditSchema ? (
                        <Button type="button" onClick={openAdd}>
                            <Plus className="size-4" />
                            Create field
                        </Button>
                    ) : null}
                </>
            }
        >
            <Head title={`Fields — ${collection.name}`} />

            <PageLayout
                description={`${collection.slug} · Field schema`}
                filters={
                    <div className="relative max-w-md flex-1">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            placeholder="Search fields…"
                            className="pl-9"
                        />
                    </div>
                }
                scrollContent
            >
                {searchQueryActive && (
                    <p className="mb-3 text-xs text-muted-foreground">
                        Clear search to reorder fields by drag and drop.
                    </p>
                )}

                <div className="mb-6">
                    <CollectionFormLayoutEditor
                        collectionId={collection.id}
                        fields={fields}
                        formLayout={collection.form_layout}
                        locales={['en', 'it']}
                    />
                </div>

                {fields.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-sidebar-border/70 p-10 text-center dark:border-sidebar-border">
                        <p className="text-sm text-muted-foreground">
                            No fields yet. Create a field to define what
                            content this collection stores.
                        </p>
                        <Button
                            type="button"
                            className="mt-4"
                            onClick={openAdd}
                            disabled={!canEditSchema}
                        >
                            <Plus className="size-4" />
                            Create field
                        </Button>
                    </div>
                ) : searchQueryActive && filteredFields.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No fields match your search.
                    </p>
                ) : (
                    <CollectionFieldsList
                        collectionId={collection.id}
                        fields={
                            searchQueryActive ? filteredFields : fields
                        }
                        reorderEnabled={!searchQueryActive}
                        onEdit={openEdit}
                    />
                )}
            </PageLayout>

            <Drawer
                direction="right"
                shouldScaleBackground
                open={addOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeAddFlow();

                        return;
                    }

                    setAddOpen(true);
                }}
            >
                <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                    <CollectionFieldTypeDrawer
                        onSelectType={(type) => {
                            setAddFieldType(type);
                            setAddFormOpen(true);
                        }}
                    />

                    <DrawerNested
                        direction="right"
                        open={addFormOpen}
                        onOpenChange={setAddFormOpen}
                    >
                        <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                            <CollectionFieldFormDrawer
                                mode="create"
                                collectionId={collection.id}
                                fieldType={addFieldType}
                                relatedCollections={relatedCollections}
                                siblingFieldNames={fields.map((field) => field.name)}
                                onSuccess={closeAddFlow}
                            />
                        </DrawerContent>
                    </DrawerNested>
                </DrawerContent>
            </Drawer>

            <Drawer
                direction="right"
                open={editField !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditField(null);
                    }
                }}
            >
                <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                    {editField !== null && (
                        <CollectionFieldFormDrawer
                            mode="edit"
                            collectionId={collection.id}
                            field={editField}
                            fieldType={editField.type}
                            relatedCollections={relatedCollections}
                            siblingFieldNames={fields.map((field) => field.name)}
                            onSuccess={() => setEditField(null)}
                        />
                    )}
                </DrawerContent>
            </Drawer>

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
