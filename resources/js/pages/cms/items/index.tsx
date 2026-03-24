import { Head, Link, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import cms from '@/routes/cms';
import type { BreadcrumbItem } from '@/types';

type Collection = {
    id: number;
    name: string;
    slug: string;
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
            { title: 'CMS', href: cms.collections.index.url() },
            { title: collection.name, href: cms.collections.show.url(collection.id) },
            { title: 'Items', href: cms.collections.items.index.url(collection.id) },
        ],
        [collection.id, collection.name],
    );

    const applyFilter = (): void => {
        router.get(cms.collections.items.index.url(collection.id), {
            filter: { ...(filters as Record<string, string>), title: filterTitle },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Items — ${collection.name}`} />

            <div className="flex flex-col gap-6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h1 className="text-xl font-semibold tracking-tight">Items</h1>
                    <Button asChild>
                        <Link href={cms.collections.items.create.url(collection.id)}>New item</Link>
                    </Button>
                </div>

                <div className="flex max-w-md flex-wrap items-end gap-2">
                    <div className="grid flex-1 gap-2">
                        <label className="text-sm font-medium" htmlFor="filter_title">
                            Filter by title (if schema has title)
                        </label>
                        <Input
                            id="filter_title"
                            value={filterTitle}
                            onChange={(e) => setFilterTitle(e.target.value)}
                            placeholder="Search…"
                        />
                    </div>
                    <Button type="button" onClick={applyFilter}>
                        Apply
                    </Button>
                </div>

                <div className="rounded-xl border border-sidebar-border/70 bg-card p-1 dark:border-sidebar-border">
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
                                    <TableCell colSpan={3} className="text-muted-foreground">
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
                                            <Button variant="link" asChild>
                                                <Link
                                                    href={cms.collections.items.show.url({
                                                        collection: collection.id,
                                                        item: row.id,
                                                    })}
                                                >
                                                    View
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {items.last_page > 1 && (
                    <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
                        {items.links.map((link, i) => (
                            <button
                                key={i}
                                type="button"
                                className={link.active ? 'font-semibold underline' : ''}
                                disabled={!link.url}
                                onClick={() => link.url && router.visit(link.url)}
                                dangerouslySetInnerHTML={{ __html: link.label }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
