import { Form, Head, Link, router } from '@inertiajs/react';
import { ChevronDown, ChevronUp, LayoutGrid, Plus } from 'lucide-react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { COLLECTION_FIELD_TYPES } from '@/lib/collection-field-types';
import { useMemo, useState } from 'react';
import collections from '@/routes/collections';
import type { BreadcrumbItem, CollectionFieldRow } from '@/types';
import type { CollectionView } from '@/types/collections';

const settingsPlaceholder = JSON.stringify(
    {
        options: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
        ],
        related_collection_id: 1,
        display_field: 'title',
        relation_type: 'many_to_one',
    },
    null,
    2,
);

export default function CollectionsFields({
    collection,
}: {
    collection: CollectionView;
}) {
    const [addOpen, setAddOpen] = useState(false);
    const [addFieldType, setAddFieldType] = useState('string');
    const [editField, setEditField] = useState<CollectionFieldRow | null>(null);
    const [editFieldType, setEditFieldType] = useState('string');

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Collections', href: collections.index.url() },
            {
                title: collection.name,
                href: collection.is_singleton
                    ? collections.show.url(collection.id)
                    : collections.items.index.url(collection.id),
            },
            {
                title: 'Fields',
                href: FieldController.index.url(collection.id),
            },
        ],
        [collection.id, collection.name, collection.is_singleton],
    );

    const fields = collection.fields;

    const move = (index: number, delta: number): void => {
        const next = [...fields];
        const j = index + delta;
        if (j < 0 || j >= next.length) {
            return;
        }
        [next[index], next[j]] = [next[j], next[index]];
        router.post(
            FieldController.reorder.url(collection.id),
            { ids: next.map((f) => f.id) },
            { preserveScroll: true },
        );
    };

    const openEdit = (field: CollectionFieldRow): void => {
        setEditFieldType(field.type);
        setEditField(field);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Fields — ${collection.name}`} />

            <div className="flex w-full flex-col gap-8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            Fields
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {collection.name} · {collection.slug}
                        </p>
                        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                            Define the schema for this collection. Item values
                            are edited only on each item or on the singleton
                            content page.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                        >
                            <Link
                                href={
                                    collection.is_singleton
                                        ? collections.show.url(collection.id)
                                        : collections.items.index.url(
                                              collection.id,
                                          )
                                }
                            >
                                Back
                            </Link>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                setAddFieldType('string');
                                setAddOpen(true);
                            }}
                        >
                            <Plus className="mr-1 size-4" />
                            Add field
                        </Button>
                    </div>
                </div>

                <div className="rounded-xl border border-sidebar-border/70 bg-card p-1 dark:border-sidebar-border">
                    {fields.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            No fields yet. Add a field to define the schema.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-24">Order</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Flags</TableHead>
                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id}>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    disabled={index === 0}
                                                    onClick={() =>
                                                        move(index, -1)
                                                    }
                                                    aria-label="Move up"
                                                >
                                                    <ChevronUp className="size-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    disabled={
                                                        index === fields.length - 1
                                                    }
                                                    onClick={() =>
                                                        move(index, 1)
                                                    }
                                                    aria-label="Move down"
                                                >
                                                    <ChevronDown className="size-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {field.name}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {field.type}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {field.translatable
                                                ? 'Translatable'
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        openEdit(field)
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                                <Form
                                                    {...FieldController.destroy.form(
                                                        {
                                                            collection:
                                                                collection.id,
                                                            field: field.id,
                                                        },
                                                    )}
                                                >
                                                    {({ processing }) => (
                                                        <Button
                                                            type="submit"
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </Form>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>

            <Drawer
                direction="right"
                open={addOpen}
                onOpenChange={(open) => {
                    setAddOpen(open);
                    if (open) {
                        setAddFieldType('string');
                    }
                }}
            >
                <DrawerContent className="max-h-screen">
                    <DrawerHeader>
                        <DrawerTitle>Add field</DrawerTitle>
                        <DrawerDescription>
                            Choose a type and optional settings (JSON) for
                            select, multiselect, and radio fields.
                        </DrawerDescription>
                    </DrawerHeader>

                    <Form
                        {...FieldController.store.form({
                            collection: collection.id,
                        })}
                        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                        options={{ preserveScroll: true }}
                        onSuccess={() => setAddOpen(false)}
                    >
                        {({ processing, errors }) => (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="add_field_name">
                                        Field name
                                    </Label>
                                    <Input
                                        id="add_field_name"
                                        name="name"
                                        required
                                        placeholder="title"
                                        pattern="[a-z][a-z0-9_]*"
                                    />
                                    <InputError message={errors.name} />
                                </div>

                                <input
                                    type="hidden"
                                    name="type"
                                    value={addFieldType}
                                />

                                <div className="grid gap-2">
                                    <Label>Type</Label>
                                    <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                                        {COLLECTION_FIELD_TYPES.map((t) => (
                                            <Button
                                                key={t.value}
                                                type="button"
                                                variant={
                                                    addFieldType === t.value
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                size="sm"
                                                className="justify-start"
                                                onClick={() =>
                                                    setAddFieldType(t.value)
                                                }
                                            >
                                                <LayoutGrid className="mr-2 size-3.5 opacity-60" />
                                                {t.label}
                                            </Button>
                                        ))}
                                    </div>
                                    <InputError message={errors.type} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="add_field_settings">
                                        Settings (JSON)
                                    </Label>
                                    <textarea
                                        id="add_field_settings"
                                        name="settings"
                                        rows={6}
                                        placeholder={settingsPlaceholder}
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                                        defaultValue=""
                                    />
                                    <InputError message={errors.settings} />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="hidden"
                                        name="translatable"
                                        value="0"
                                    />
                                    <input
                                        id="add_translatable"
                                        type="checkbox"
                                        name="translatable"
                                        value="1"
                                        className="size-4 rounded border"
                                    />
                                    <Label htmlFor="add_translatable">
                                        Translatable
                                    </Label>
                                </div>

                                <DrawerFooter className="flex flex-row justify-end gap-2 px-0">
                                    <DrawerClose asChild>
                                        <Button type="button" variant="outline">
                                            Cancel
                                        </Button>
                                    </DrawerClose>
                                    <Button type="submit" disabled={processing}>
                                        Add field
                                    </Button>
                                </DrawerFooter>
                            </>
                        )}
                    </Form>
                </DrawerContent>
            </Drawer>

            <Drawer
                direction="right"
                open={editField !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditField(null);
                    }
                }}
            >
                <DrawerContent className="max-h-screen">
                    <DrawerHeader>
                        <DrawerTitle>Edit field</DrawerTitle>
                        <DrawerDescription>
                            Update name, type, settings, or translatable flag.
                        </DrawerDescription>
                    </DrawerHeader>

                    {editField !== null && (
                        <Form
                            {...FieldController.update.form({
                                collection: collection.id,
                                field: editField.id,
                            })}
                            key={editField.id}
                            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                            options={{ preserveScroll: true }}
                            onSuccess={() => setEditField(null)}
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit_field_name">
                                            Field name
                                        </Label>
                                        <Input
                                            id="edit_field_name"
                                            name="name"
                                            required
                                            defaultValue={editField.name}
                                            pattern="[a-z][a-z0-9_]*"
                                        />
                                        <InputError message={errors.name} />
                                    </div>

                                    <input
                                        type="hidden"
                                        name="type"
                                        value={editFieldType}
                                    />

                                    <div className="grid gap-2">
                                        <Label>Type</Label>
                                        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                                            {COLLECTION_FIELD_TYPES.map((t) => (
                                                <Button
                                                    key={t.value}
                                                    type="button"
                                                    variant={
                                                        editFieldType ===
                                                        t.value
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    className="justify-start"
                                                    onClick={() =>
                                                        setEditFieldType(t.value)
                                                    }
                                                >
                                                    <LayoutGrid className="mr-2 size-3.5 opacity-60" />
                                                    {t.label}
                                                </Button>
                                            ))}
                                        </div>
                                        <InputError message={errors.type} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="edit_field_settings">
                                            Settings (JSON)
                                        </Label>
                                        <textarea
                                            id="edit_field_settings"
                                            name="settings"
                                            rows={6}
                                            placeholder={settingsPlaceholder}
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                                            defaultValue={
                                                editField.settings
                                                    ? JSON.stringify(
                                                          editField.settings,
                                                          null,
                                                          2,
                                                      )
                                                    : ''
                                            }
                                        />
                                        <InputError message={errors.settings} />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="hidden"
                                            name="translatable"
                                            value="0"
                                        />
                                        <input
                                            id="edit_translatable"
                                            type="checkbox"
                                            name="translatable"
                                            value="1"
                                            defaultChecked={
                                                editField.translatable
                                            }
                                            className="size-4 rounded border"
                                        />
                                        <Label htmlFor="edit_translatable">
                                            Translatable
                                        </Label>
                                    </div>

                                    <DrawerFooter className="flex flex-row justify-end gap-2 px-0">
                                        <DrawerClose asChild>
                                            <Button type="button" variant="outline">
                                                Cancel
                                            </Button>
                                        </DrawerClose>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            Save field
                                        </Button>
                                    </DrawerFooter>
                                </>
                            )}
                        </Form>
                    )}
                </DrawerContent>
            </Drawer>
        </AppLayout>
    );
}
