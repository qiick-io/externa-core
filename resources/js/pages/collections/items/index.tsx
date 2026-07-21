import { Head, Link, router } from '@inertiajs/react';
import { Plus, Rows3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import collections from '@/routes/collections';
import type { BreadcrumbItem } from '@/types';

type Collection = {
    id: number;
    name: string;
    slug: string;
    is_singleton: boolean;
    sort_order: number;
};

type ItemRow = {
    id: number;
    collection_id: number;
    data: Record<string, unknown>;
};

type Paginator<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

/**
 * Paginated list of items in a collection.
 * @returns {JSX.Element}
 */
export default function ItemsIndex({
    collection,
    items,
    filters,
}: {
    collection: Collection;
    items: Paginator<ItemRow>;
    filters: Record<string, string>;
}) {
    const [filterTitle, setFilterTitle] = useState(filters.title ?? '');

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Collections', href: collections.index.url() },
            {
                title: collection.name,
                href: collections.items.index.url(collection.id),
            },
            { title: 'Items', href: collections.items.index.url(collection.id) },
        ],
        [collection.id, collection.name],
    );

    const visit = useCallback(
        (title?: string) => {
            router.get(
                collections.items.index.url(collection.id),
                {
                    filter: {
                        ...(filters as Record<string, string>),
                        title: title || undefined,
                    },
                },
                { preserveState: true, preserveScroll: true },
            );
        },
        [collection.id, filters],
    );

    useEffect(() => {
        // Only refetch when the user changes the title filter. Mount / pagination
        // remounts leave filterTitle === filters.title; visiting without `page`
        // would reset to page 1.
        if (filterTitle === (filters.title ?? '')) {
            return;
        }

        const timer = setTimeout(() => {
            visit(filterTitle || undefined);
        }, 350);

        return () => clearTimeout(timer);
    }, [filterTitle, filters.title]); // eslint-disable-line react-hooks/exhaustive-deps

    const collectionForm = useCollectionEditDrawer();

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    <CollectionEditButton
                        collectionForm={collectionForm}
                        collection={collection}
                    />
                    <Button variant="outline" asChild>
                        <Link
                            href={FieldController.index.url(collection.id)}
                        >
                            <Rows3 className="mr-1 size-4" />
                            Edit fields
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link
                            href={collections.items.new.url(collection.id)}
                        >
                            <Plus className="mr-1 size-4" />
                            New item
                        </Link>
                    </Button>
                </>
            }
        >
            <Head title={`Items — ${collection.name}`} />

            <PageLayout
                filters={
                    <DataTableToolbar
                        search={filterTitle}
                        onSearchChange={setFilterTitle}
                        searchPlaceholder="Filter by title…"
                    />
                }
                footer={
                    items.last_page > 1 ? (
                        <TablePagination links={items.links} />
                    ) : undefined
                }
            >
                <TablePanel>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Data preview</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.data.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={3}
                                        className="text-muted-foreground"
                                    >
                                        No items yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.data.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{row.id}</TableCell>
                                        <TableCell className="max-w-md truncate font-mono text-xs">
                                            {JSON.stringify(row.data)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                            >
                                                <Link
                                                    href={collections.items.show.url(
                                                        {
                                                            collection:
                                                                collection.id,
                                                            item: row.id,
                                                        },
                                                    )}
                                                >
                                                    Edit
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TablePanel>
            </PageLayout>

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
