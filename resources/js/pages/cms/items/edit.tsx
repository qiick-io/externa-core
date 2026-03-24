import { Form, Head, Link, usePage } from '@inertiajs/react';
import ItemController from '@/actions/App/Http/Controllers/Cms/ItemController';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import cms from '@/routes/cms';
import type { BreadcrumbItem } from '@/types';

type FieldRow = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
};

type Collection = {
    id: number;
    name: string;
    slug: string;
    fields: FieldRow[];
};

type ItemPayload = {
    id: number;
    data: Record<string, unknown>;
};

export default function ItemsEdit({
    collection,
    item,
    rawData,
}: {
    collection: Collection;
    item: ItemPayload;
    rawData: Record<string, unknown>;
}) {
    const { cmsLocales } = usePage().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'CMS', href: cms.collections.index.url() },
        { title: collection.name, href: cms.collections.show.url(collection.id) },
        { title: 'Items', href: cms.collections.items.index.url(collection.id) },
        { title: `Edit #${item.id}`, href: cms.collections.items.edit.url({ collection: collection.id, item: item.id }) },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit item #${item.id}`} />

            <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
                <h1 className="text-xl font-semibold tracking-tight">Edit item #{item.id}</h1>

                <Form
                    {...ItemController.update.form({ collection: collection.id, item: item.id })}
                    className="space-y-6"
                    options={{ preserveScroll: true }}
                >
                    {({ processing, errors }) => (
                        <>
                            <DynamicItemFields
                                fields={collection.fields}
                                locales={cmsLocales}
                                defaults={rawData}
                            />
                            {errors.data && (
                                <p className="text-destructive text-sm">{String(errors.data)}</p>
                            )}
                            <div className="flex gap-2">
                                <Button type="submit" disabled={processing}>
                                    Save
                                </Button>
                                <Button variant="outline" asChild>
                                    <Link
                                        href={cms.collections.items.show.url({
                                            collection: collection.id,
                                            item: item.id,
                                        })}
                                    >
                                        Cancel
                                    </Link>
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </AppLayout>
    );
}
