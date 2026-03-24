import { Form, Head, Link } from '@inertiajs/react';
import ItemController from '@/actions/App/Http/Controllers/Cms/ItemController';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import cms from '@/routes/cms';
import type { BreadcrumbItem } from '@/types';

type Collection = {
    id: number;
    name: string;
    slug: string;
};

type ItemPayload = {
    id: number;
    data: Record<string, unknown>;
};

export default function ItemsShow({
    collection,
    item,
}: {
    collection: Collection;
    item: ItemPayload;
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'CMS', href: cms.collections.index.url() },
        { title: collection.name, href: cms.collections.show.url(collection.id) },
        { title: 'Items', href: cms.collections.items.index.url(collection.id) },
        {
            title: `#${item.id}`,
            href: cms.collections.items.show.url({ collection: collection.id, item: item.id }),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Item #${item.id}`} />

            <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h1 className="text-xl font-semibold tracking-tight">Item #{item.id}</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link
                                href={cms.collections.items.edit.url({
                                    collection: collection.id,
                                    item: item.id,
                                })}
                            >
                                Edit
                            </Link>
                        </Button>
                        <Form
                            {...ItemController.destroy.form({
                                collection: collection.id,
                                item: item.id,
                            })}
                        >
                            {({ processing }) => (
                                <Button type="submit" variant="destructive" disabled={processing}>
                                    Delete
                                </Button>
                            )}
                        </Form>
                    </div>
                </div>

                <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-sm">
                    {JSON.stringify(item.data, null, 2)}
                </pre>

                <Button variant="outline" asChild>
                    <Link href={cms.collections.items.index.url(collection.id)}>Back to items</Link>
                </Button>
            </div>
        </AppLayout>
    );
}
