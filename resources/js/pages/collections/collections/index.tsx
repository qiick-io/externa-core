import { Head, Link, router } from '@inertiajs/react';
import { Pencil, Plus, Rows3, Trash2 } from 'lucide-react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCollections } from '@/hooks/use-collections';
import AppLayout from '@/layouts/app-layout';
import collectionRoutes from '@/routes/collections';
import type { BreadcrumbItem, CollectionRow } from '@/types';

export default function CollectionsIndex({
    collections,
    filters = {},
}: {
    collections: CollectionRow[];
    filters?: { trashed?: boolean };
}) {
    const { can } = useCan();
    const isTrashed = filters.trashed === true;
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
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                !isTrashed ? (
                    <Button
                        type="button"
                        onClick={() => {
                            setEditing(null);
                            setOpen(true);
                        }}
                    >
                        <Plus className="mr-1 size-4" />
                        New collection
                    </Button>
                ) : undefined
            }
        >
            <Head title="Collections" />

            <Drawer
                direction="right"
                open={open}
                onOpenChange={handleDrawerOpenChange}
            >
                <PageLayout
                    filtersRight={
                        <ToggleGroup
                            type="single"
                            value={isTrashed ? 'trashed' : 'active'}
                            onValueChange={(value) => {
                                if (!value) {
                                    return;
                                }

                                router.get(
                                    collectionRoutes.index.url({
                                        query: {
                                            trashed:
                                                value === 'trashed'
                                                    ? true
                                                    : undefined,
                                        },
                                    }),
                                    {},
                                    {
                                        preserveState: true,
                                        preserveScroll: true,
                                    },
                                );
                            }}
                        >
                            <ToggleGroupItem
                                value="active"
                                aria-label="Active collections"
                            >
                                Active
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="trashed"
                                aria-label="Trashed collections"
                            >
                                <Trash2 className="size-4" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    }
                >
                    <TablePanel>
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
                                                    {isTrashed ? (
                                                        <>
                                                            {can(
                                                                PermissionEnum.CanRestoreCollections,
                                                            ) && (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        router.post(
                                                                            collectionRoutes.restore.url(
                                                                                c.id,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    Restore
                                                                </Button>
                                                            )}
                                                            {can(
                                                                PermissionEnum.CanForceDeleteCollections,
                                                            ) && (
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        router.delete(
                                                                            collectionRoutes.forceDelete.url(
                                                                                c.id,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                    permanently
                                                                </Button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
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
                                                                    setEditing(
                                                                        c,
                                                                    );
                                                                    setOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                <Pencil className="mr-1 size-3.5" />
                                                                Edit
                                                            </Button>
                                                            {can(
                                                                PermissionEnum.CanDeleteCollections,
                                                            ) && (
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        router.delete(
                                                                            collectionRoutes.destroy.url(
                                                                                c.id,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </TablePanel>
                </PageLayout>

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
