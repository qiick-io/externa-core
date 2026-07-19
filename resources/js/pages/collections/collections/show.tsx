import { Form, Head, Link } from '@inertiajs/react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Collections/ContentCollectionController';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
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
}: {
    collection: CollectionView;
    singletonRawData: Record<string, unknown> | null;
    relatedCollections?: { id: number; name: string; slug: string }[];
}) {
    const { locales, breadcrumbs, contentDefaults, hasFields } = useCollection({
        collection,
        singletonRawData,
        editableRawData: null,
    });

    const collectionForm = useCollectionEditDrawer();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={collection.name} />

            <div className="flex w-full flex-col gap-8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {collection.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {collection.slug}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Singleton collection
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link
                                href={FieldController.index.url(collection.id)}
                            >
                                Edit fields
                            </Link>
                        </Button>
                        <CollectionEditButton
                            collectionForm={collectionForm}
                            collection={collectionToFormRow(collection)}
                        />
                        <Form
                            {...ContentCollectionController.destroy.form({
                                collection: collection.id,
                            })}
                        >
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    disabled={processing}
                                >
                                    Delete collection
                                </Button>
                            )}
                        </Form>
                    </div>
                </div>

                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-medium">Content</h2>
                            <p className="text-sm text-muted-foreground">
                                Values for this entry. Define field types and
                                order under{' '}
                                <Link
                                    className="text-primary underline-offset-4 hover:underline"
                                    href={FieldController.index.url(collection.id)}
                                >
                                    Edit fields
                                </Link>
                                .
                            </p>
                        </div>
                        {hasFields && (
                            <Button
                                type="submit"
                                form={COLLECTION_CONTENT_FORM_ID}
                                size="sm"
                            >
                                Save
                            </Button>
                        )}
                    </div>

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
                            {...ContentCollectionController.upsertSingletonContent.form(
                                {
                                    collection: collection.id,
                                },
                            )}
                            id={COLLECTION_CONTENT_FORM_ID}
                            className="space-y-6"
                            options={{ preserveScroll: true }}
                        >
                            {({ errors }) => {
                                const dataErrors = collectCollectionDataErrorMessages(
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
                                        />
                                    </>
                                );
                            }}
                        </Form>
                    )}
                </section>

                <CollectionEditDrawer collectionForm={collectionForm} />
            </div>
        </AppLayout>
    );
}
