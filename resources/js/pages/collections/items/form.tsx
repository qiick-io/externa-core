import { Form, Head, Link } from '@inertiajs/react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
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
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={pageTitle} />

            <div className="flex w-full flex-col gap-8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {heading}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {collection.slug}
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
                        <Button variant="outline" size="sm" asChild>
                            <Link
                                href={collections.items.index.url(collection.id)}
                            >
                                All items
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
                                        size="sm"
                                        disabled={processing}
                                    >
                                        Delete
                                    </Button>
                                )}
                            </Form>
                        )}
                    </div>
                </div>

                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-medium">Content</h2>
                            <p className="text-sm text-muted-foreground">
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
                            </p>
                        </div>
                        {hasFields && (
                            <Button
                                type="submit"
                                form={COLLECTION_ITEM_FORM_ID}
                                size="sm"
                            >
                                {isNew ? 'Create' : 'Save'}
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
                                        />
                                    </>
                                );
                            }}
                        </Form>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}
