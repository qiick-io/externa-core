import { Form, Head, Link } from '@inertiajs/react';
import { Rows3, Save, Trash2 } from 'lucide-react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import AppLayout from '@/layouts/app-layout';
import { collectCollectionDataErrorMessages } from '@/lib/collection-data-errors';
import collections from '@/routes/collections';
import type { BreadcrumbItem } from '@/types';
import type { CollectionView } from '@/types/collections';

const COLLECTION_ITEM_FORM_ID = 'collection-item-form';

type ItemPayload = {
    id: number;
    data: Record<string, unknown>;
};

/**
 * Create or edit a collection item.
 * @returns {JSX.Element}
 */
export default function ItemsForm({
    collection,
    item,
    rawData,
    isNew,
    relatedCollections = [],
}: {
    collection: CollectionView;
    item: ItemPayload | null;
    rawData: Record<string, unknown>;
    isNew: boolean;
    relatedCollections?: { id: number; name: string; slug: string }[];
}) {
    const { locales, breadcrumbs: collectionBreadcrumbs, contentDefaults, hasFields } =
        useCollection({
            collection,
            singletonRawData: null,
            editableRawData: rawData,
        });

    const lastCrumb: BreadcrumbItem = isNew
        ? {
              title: 'New item',
              href: collections.items.new.url(collection.id),
          }
        : {
              title: `Item #${item!.id}`,
              href: collections.items.show.url({
                  collection: collection.id,
                  item: item!.id,
              }),
          };

    const breadcrumbs: BreadcrumbItem[] = [
        ...collectionBreadcrumbs,
        {
            title: 'Items',
            href: collections.items.index.url(collection.id),
        },
        lastCrumb,
    ];

    const pageTitle = isNew
        ? `New item — ${collection.name}`
        : `Item #${item!.id} — ${collection.name}`;

    const heading = isNew ? 'New item' : `Item #${item!.id}`;

    const formProps = isNew
        ? ItemController.store.form({ collection: collection.id })
        : ItemController.update.form({
              collection: collection.id,
              item: item!.id,
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
                    {!isNew && item !== null && (
                        <Form
                            {...ItemController.destroy.form({
                                collection: collection.id,
                                item: item.id,
                            })}
                        >
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    disabled={processing}
                                >
                                    <Trash2 className="size-4" />
                                    Delete
                                </Button>
                            )}
                        </Form>
                    )}
                    {hasFields && (
                        <Button type="submit" form={COLLECTION_ITEM_FORM_ID}>
                            <Save className="size-4" />
                            {isNew ? 'Create' : 'Save'}
                        </Button>
                    )}
                </>
            }
        >
            <Head title={pageTitle} />

            <PageLayout
                description={
                    <>
                        {heading} · {collection.slug}.{' '}
                        {isNew
                            ? 'Fill in values for this new item. Define fields under '
                            : 'Values for this item only. Change field definitions under '}
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
                        {...formProps}
                        id={COLLECTION_ITEM_FORM_ID}
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
                                        formLayout={collection.form_layout}
                                    />
                                </>
                            );
                        }}
                    </Form>
                )}
            </PageLayout>
        </AppLayout>
    );
}
