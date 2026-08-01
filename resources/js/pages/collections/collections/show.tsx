import { Form, Head, Link, router } from '@inertiajs/react';
import { Rows3, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { PageLayout } from '@/components/layout/page-layout';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import { collectCollectionDataErrorMessages } from '@/lib/collection-data-errors';
import { collectionToFormRow } from '@/types';
import type { CollectionView } from '@/types/collections';

const COLLECTION_CONTENT_FORM_ID = 'collection-content-form';

/**
 * Singleton collection item editor.
 * @returns {JSX.Element}
 */
export default function CollectionsShow({
    collection,
    singletonRawData,
    relatedCollections = [],
    fieldGrants = null,
}: {
    collection: CollectionView;
    singletonRawData: Record<string, unknown> | null;
    relatedCollections?: { id: number; name: string; slug: string }[];
    fieldGrants?: Record<
        string,
        { read: boolean; create: boolean; update: boolean }
    > | null;
}) {
    const { locales, breadcrumbs, contentDefaults, hasFields } = useCollection({
        collection,
        singletonRawData,
        editableRawData: null,
    });

    const collectionForm = useCollectionEditDrawer();
    const [isDirty, setIsDirty] = useState(false);
    const [formKey, setFormKey] = useState(0);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setIsDirty(false);
            setFormKey((key) => key + 1);
        },
    });

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    <Button variant="outline" asChild>
                        <Link href={FieldController.index.url(collection.id)}>
                            <Rows3 className="size-4" />
                            Edit fields
                        </Link>
                    </Button>
                    <CollectionEditButton
                        collectionForm={collectionForm}
                        collection={collectionToFormRow(collection)}
                    />
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                    >
                        <Trash2 className="size-4" />
                        Delete collection
                    </Button>
                    <UnsavedChangesToolbar
                        isDirty={isDirty}
                        className="flex items-center gap-2"
                    />
                    {hasFields && (
                        <Button type="submit" form={COLLECTION_CONTENT_FORM_ID}>
                            <Save className="size-4" />
                            Save
                        </Button>
                    )}
                </>
            }
        >
            <Head title={collection.name} />

            <PageLayout
                description={
                    <>
                        {collection.slug} · Singleton collection. Values for
                        this entry. Define field types and order under{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={FieldController.index.url(collection.id)}
                        >
                            Edit fields
                        </Link>
                        .
                    </>
                }
                scrollContent
            >
                {!hasFields && (
                    <p className="rounded-xl border border-dashed border-sidebar-border/70 p-6 text-sm text-muted-foreground dark:border-sidebar-border">
                        No fields yet.{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={FieldController.index.url(collection.id)}
                        >
                            Add fields
                        </Link>{' '}
                        before entering content.
                    </p>
                )}

                {hasFields && (
                    <Form
                        key={formKey}
                        {...ContentCollectionController.upsertSingletonContent.form(
                            {
                                collection: collection.id,
                            },
                        )}
                        id={COLLECTION_CONTENT_FORM_ID}
                        className="space-y-6"
                        options={{ preserveScroll: true }}
                        onSuccess={() => setIsDirty(false)}
                        onInput={() => setIsDirty(true)}
                        onChange={() => setIsDirty(true)}
                    >
                        {({ errors }) => {
                            const dataErrors =
                                collectCollectionDataErrorMessages(
                                    errors as Record<string, unknown>,
                                );

                            return (
                                <>
                                    {dataErrors.length > 0 && (
                                        <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
                                            {dataErrors.map((msg, idx) => (
                                                <li key={idx}>{msg}</li>
                                            ))}
                                        </ul>
                                    )}
                                    <DynamicItemFields
                                        variant="cards"
                                        collectionId={collection.id}
                                        fields={collection.fields}
                                        locales={locales}
                                        defaults={contentDefaults}
                                        relatedCollections={relatedCollections}
                                        formLayout={collection.form_layout}
                                        fieldGrants={fieldGrants}
                                        isNew={singletonRawData === null}
                                    />
                                </>
                            );
                        }}
                    </Form>
                )}

                <CollectionEditDrawer collectionForm={collectionForm} />
            </PageLayout>

            <ConfirmDestructiveDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete collection?"
                description={`Delete "${collection.name}"? This collection will be soft-deleted.`}
                confirming={deleting}
                onConfirm={() => {
                    setDeleting(true);
                    router.delete(
                        ContentCollectionController.destroy.url({
                            collection: collection.id,
                        }),
                        {
                            onFinish: () => setDeleting(false),
                            onError: () => setDeleteOpen(false),
                        },
                    );
                }}
            />
        </AppLayout>
    );
}
