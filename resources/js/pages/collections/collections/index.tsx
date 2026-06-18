import { Head, Link } from '@inertiajs/react';
import { Database, Pencil, Rows3 } from 'lucide-react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import {
    AdminPageLayout,
    AdminTablePanel,
} from '@/components/admin/admin-page-layout';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useCollections } from '@/hooks/use-collections';
import AppLayout from '@/layouts/app-layout';
import collectionRoutes from '@/routes/collections';
import type { BreadcrumbItem, CollectionRow } from '@/types';

export default function CollectionsIndex({
    collections,
}: {
    collections: CollectionRow[];
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Collections', href: collectionRoutes.index.url() },
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
            <Head title="Collections" />

            <Drawer
                direction="right"
                open={open}
                onOpenChange={handleDrawerOpenChange}
            >
                <AdminPageLayout
                    title="Collections"
                    icon={Database}
                    actions={
                        <Button
                            type="button"
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            New collection
                        </Button>
                    }
                >
                    <AdminTablePanel>
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
                                                            href={
                                                                c.is_singleton
                                                                    ? collectionRoutes.show.url(
                                                                          c.id,
                                                                      )
                                                                    : collectionRoutes.items.index.url(
                                                                          c.id,
                                                                      )
                                                            }
                                                        >
                                                            Open
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        asChild
                                                    >
                                                        <Link
                                                            href={FieldController.index.url(
                                                                c.id,
                                                            )}
                                                        >
                                                            <Rows3 className="mr-1 size-3.5" />
                                                            Edit fields
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
                    </AdminTablePanel>
                </AdminPageLayout>

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
