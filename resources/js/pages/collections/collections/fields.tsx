import { Head } from '@inertiajs/react';
import { PackagePlus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { ApplyFieldPackDialog } from '@/components/collections/apply-field-pack-dialog';
import type { FieldPackSummary } from '@/components/collections/apply-field-pack-dialog';
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
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerNested } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useDrawerDeepLink } from '@/hooks/use-drawer-deep-link';
import { useRequestLeave } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import { fieldTypeLabel } from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { STRING_LIMITS } from '@/lib/string-limits';
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
    fieldPacks = [],
}: {
    collection: CollectionView;
    relatedCollections?: RelatedCollectionOption[];
    fieldPacks?: FieldPackSummary[];
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const canEditSchema = can(PermissionEnum.CanEditCollections);
    const requestLeave = useRequestLeave();
    const [addOpen, setAddOpen] = useState(false);
    const [addFormOpen, setAddFormOpen] = useState(false);
    const [addFieldType, setAddFieldType] = useState('string');
    const [editField, setEditField] = useState<CollectionFieldRow | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [packDialogOpen, setPackDialogOpen] = useState(false);

    const deepLink = useDrawerDeepLink({
        editParam: 'field',
        newParam: 'newField',
        onEdit: (id) => {
            if (!canEditSchema) {
                return;
            }

            const field = collection.fields.find((f) => String(f.id) === id);

            if (!field) {
                return;
            }

            setEditField(field);
        },
        onNew: () => {
            if (!canEditSchema) {
                return;
            }

            setAddFieldType('string');
            setAddFormOpen(false);
            setAddOpen(true);
        },
    });

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
                fieldTypeLabel(field.type, t).toLowerCase().includes(query),
        );
    }, [fields, searchQuery, t]);

    const searchQueryActive = searchQuery.trim() !== '';

    const openEdit = (field: CollectionFieldRow): void => {
        setEditField(field);
        deepLink.syncEdit(field.id);
    };

    const openAdd = (): void => {
        setAddFieldType('string');
        setAddFormOpen(false);
        setAddOpen(true);
        deepLink.syncNew();
    };

    const closeAddFlow = (): void => {
        setAddFormOpen(false);
        setAddOpen(false);
        setAddFieldType('string');
        deepLink.syncClosed();
    };

    const handleAddDrawerOpenChange = (open: boolean): void => {
        if (open) {
            setAddOpen(true);

            return;
        }

        void requestLeave().then((ok) => {
            if (ok) {
                closeAddFlow();
            }
        });
    };

    const handleAddFormOpenChange = (open: boolean): void => {
        if (open) {
            setAddFormOpen(true);

            return;
        }

        void requestLeave().then((ok) => {
            if (ok) {
                setAddFormOpen(false);
            }
        });
    };

    const handleEditDrawerOpenChange = (open: boolean): void => {
        if (open) {
            return;
        }

        void requestLeave().then((ok) => {
            if (ok) {
                setEditField(null);
                deepLink.syncClosed();
            }
        });
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
                        <>
                            <HeaderIconButton
                                type="button"
                                variant="outline"
                                label={t(
                                    'collections.packs.addFieldPackEllipsis',
                                )}
                                onClick={() => setPackDialogOpen(true)}
                                disabled={fieldPacks.length === 0}
                            >
                                <PackagePlus className="size-4" />
                            </HeaderIconButton>
                            <Button type="button" onClick={openAdd}>
                                <Plus className="size-4" />
                                {t('collections.createField')}
                            </Button>
                        </>
                    ) : null}
                </>
            }
        >
            <Head
                title={t('collections.fieldsTitle', { name: collection.name })}
            />

            <PageLayout
                description={`${collection.slug} · ${t('collections.fieldSchema')}`}
                filters={
                    <div className="relative max-w-md flex-1">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            placeholder={t('collections.searchFields')}
                            maxLength={STRING_LIMITS.SEARCH}
                            className="pl-9"
                        />
                    </div>
                }
                scrollContent
            >
                {searchQueryActive && (
                    <p className="mb-3 text-xs text-muted-foreground">
                        {t('collections.clearSearchToReorder')}
                    </p>
                )}

                {fields.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-sidebar-border/70 p-10 text-center dark:border-sidebar-border">
                        <p className="text-sm text-muted-foreground">
                            {t('collections.noFieldsYet')}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            {canEditSchema && fieldPacks.length > 0 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setPackDialogOpen(true)}
                                >
                                    <PackagePlus className="size-4" />
                                    {t(
                                        'collections.packs.addFieldPackEllipsis',
                                    )}
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                onClick={openAdd}
                                disabled={!canEditSchema}
                            >
                                <Plus className="size-4" />
                                {t('collections.createField')}
                            </Button>
                        </div>
                    </div>
                ) : searchQueryActive && filteredFields.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No fields match your search.
                    </p>
                ) : (
                    <CollectionFieldsList
                        collectionId={collection.id}
                        fields={searchQueryActive ? filteredFields : fields}
                        reorderEnabled={!searchQueryActive}
                        onEdit={openEdit}
                    />
                )}
            </PageLayout>

            <ApplyFieldPackDialog
                collectionId={collection.id}
                fieldPacks={fieldPacks}
                open={packDialogOpen}
                onOpenChange={setPackDialogOpen}
            />

            <Drawer
                direction="right"
                shouldScaleBackground
                open={addOpen}
                onOpenChange={handleAddDrawerOpenChange}
            >
                <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                    <CollectionFieldTypeDrawer
                        collectionName={collection.name}
                        collectionIcon={collection.icon}
                        collectionColor={collection.color}
                        onSelectType={(type) => {
                            setAddFieldType(type);
                            setAddFormOpen(true);
                        }}
                    />

                    <DrawerNested
                        direction="right"
                        open={addFormOpen}
                        onOpenChange={handleAddFormOpenChange}
                    >
                        <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                            <CollectionFieldFormDrawer
                                mode="create"
                                collectionId={collection.id}
                                fieldType={addFieldType}
                                relatedCollections={relatedCollections}
                                siblingFieldNames={fields.map(
                                    (field) => field.name,
                                )}
                                onCancel={() => handleAddFormOpenChange(false)}
                                onSuccess={closeAddFlow}
                            />
                        </DrawerContent>
                    </DrawerNested>
                </DrawerContent>
            </Drawer>

            <Drawer
                direction="right"
                open={editField !== null}
                onOpenChange={handleEditDrawerOpenChange}
            >
                <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-3xl">
                    {editField !== null && (
                        <CollectionFieldFormDrawer
                            mode="edit"
                            collectionId={collection.id}
                            field={editField}
                            fieldType={editField.type}
                            relatedCollections={relatedCollections}
                            siblingFieldNames={fields.map(
                                (field) => field.name,
                            )}
                            onCancel={() => handleEditDrawerOpenChange(false)}
                            onSuccess={() => {
                                setEditField(null);
                                deepLink.syncClosed();
                            }}
                        />
                    )}
                </DrawerContent>
            </Drawer>

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
