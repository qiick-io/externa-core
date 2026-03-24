import { Head, Link } from '@inertiajs/react';
import { Database, Pencil } from 'lucide-react';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useCollections } from '@/hooks/use-collections';
import AppLayout from '@/layouts/app-layout';
import cms from '@/routes/cms';
import type { BreadcrumbItem, CollectionRow } from '@/types';

export default function CollectionsIndex({
    collections,
}: {
    collections: CollectionRow[];
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'CMS', href: cms.collections.index.url() },
        { title: 'Collections', href: cms.collections.index.url() },
    ];

    const {
        open,
        setOpen,
        editing,
        setEditing,
        slugManual,
        setSlugManual,
        form,
        title,
        submit,
        handleDrawerOpenChange,
    } = useCollections();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="CMS collections" />

            <Drawer
                direction="right"
                open={open}
                onOpenChange={handleDrawerOpenChange}
            >
                <div className="flex flex-col gap-6 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Database className="size-5" />
                            <h1 className="text-xl font-semibold tracking-tight">
                                Collections
                            </h1>
                        </div>
                        <Button
                            type="button"
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            New collection
                        </Button>
                    </div>

                    <div className="rounded-xl border border-sidebar-border/70 bg-card p-1 dark:border-sidebar-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-sidebar-border/70 text-left">
                                    <th className="p-3 font-medium">Name</th>
                                    <th className="p-3 font-medium">Slug</th>
                                    <th className="p-3 font-medium">Type</th>
                                    <th className="p-3 text-right font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {collections.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="p-4 text-muted-foreground"
                                        >
                                            No collections yet.
                                        </td>
                                    </tr>
                                ) : (
                                    collections.map((c) => (
                                        <tr
                                            key={c.id}
                                            className="border-b border-sidebar-border/40 last:border-0"
                                        >
                                            <td className="p-3 font-medium">
                                                {c.name}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {c.slug}
                                            </td>
                                            <td className="p-3">
                                                {c.is_singleton ? (
                                                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                                                        Singleton
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <Button
                                                        variant="link"
                                                        asChild
                                                    >
                                                        <Link
                                                            href={cms.collections.show.url(
                                                                c.id,
                                                            )}
                                                        >
                                                            Open
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditing(c);
                                                            setOpen(true);
                                                        }}
                                                    >
                                                        <Pencil className="mr-1 size-3.5" />
                                                        Edit
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <CollectionFormDrawer
                    editing={editing}
                    slugManual={slugManual}
                    setSlugManual={setSlugManual}
                    form={form}
                    title={title}
                    submit={submit}
                />
            </Drawer>
        </AppLayout>
    );
}
