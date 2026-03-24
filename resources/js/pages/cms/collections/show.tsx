import { Form, Head, Link, router } from '@inertiajs/react';
import { LayoutGrid, Plus } from 'lucide-react';
import ContentCollectionController from '@/actions/App/Http/Controllers/Cms/ContentCollectionController';
import FieldController from '@/actions/App/Http/Controllers/Cms/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Cms/ItemController';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
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
import { CMS_SELECT_INPUT_CLASS, useCollection } from '@/hooks/use-collection';
import { useCollections } from '@/hooks/use-collections';
import AppLayout from '@/layouts/app-layout';
import { CMS_FIELD_TYPES } from '@/lib/cms-field-types';
import { cn } from '@/lib/utils';
import cms from '@/routes/cms';
import { cmsCollectionToFormRow } from '@/types';
import type { CmsCollection, ItemPickerRow } from '@/types';

export default function CollectionsShow({
    collection,
    singletonRawData,
    itemPicker,
    selectedItemId,
    editableRawData,
}: {
    collection: CmsCollection;
    singletonItem: { id: number; data: Record<string, unknown> } | null;
    singletonRawData: Record<string, unknown> | null;
    itemPicker: ItemPickerRow[];
    selectedItemId: number | null;
    editableRawData: Record<string, unknown> | null;
}) {
    const {
        locales,
        fieldDrawerOpen,
        setFieldDrawerOpen,
        fieldType,
        setFieldType,
        settingsPlaceholder,
        breadcrumbs,
        contentDefaults,
        hasFields,
        fieldActions,
    } = useCollection({
        collection,
        singletonRawData,
        editableRawData,
    });

    const collectionForm = useCollections();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={collection.name} />

            <div className="flex w-full flex-col gap-8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {collection.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {collection.slug}
                        </p>
                        {collection.is_singleton && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Singleton collection
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!collection.is_singleton && itemPicker.length > 0 && (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={cms.collections.items.index.url(
                                        collection.id,
                                    )}
                                >
                                    All items
                                </Link>
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                collectionForm.setEditing(
                                    cmsCollectionToFormRow(collection),
                                );
                                collectionForm.setOpen(true);
                            }}
                        >
                            Edit collection
                        </Button>
                        <Form
                            {...ContentCollectionController.destroy.form({
                                collection: collection.id,
                            })}
                        >
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    disabled={processing}
                                >
                                    Delete collection
                                </Button>
                            )}
                        </Form>
                    </div>
                </div>

                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-medium">
                                Fields & content
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Define fields and edit values here. Use “Add
                                field” for schema; each card is one field with
                                the right control for its type.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFieldDrawerOpen(true)}
                        >
                            <Plus className="mr-1 size-4" />
                            Add field
                        </Button>
                    </div>

                    {!hasFields && (
                        <p className="rounded-xl border border-dashed border-sidebar-border/70 p-6 text-sm text-muted-foreground dark:border-sidebar-border">
                            No fields yet. Add a field to start entering
                            content.
                        </p>
                    )}

                    {hasFields && collection.is_singleton && (
                        <Form
                            {...ContentCollectionController.upsertSingletonContent.form(
                                {
                                    collection: collection.id,
                                },
                            )}
                            className="space-y-6"
                            options={{ preserveScroll: true }}
                        >
                            {({ processing, errors }) => (
                                <>
                                    <DynamicItemFields
                                        variant="cards"
                                        fieldActions={fieldActions}
                                        fields={collection.fields}
                                        locales={locales}
                                        defaults={contentDefaults}
                                    />
                                    {errors.data && (
                                        <p className="text-sm text-destructive">
                                            {String(errors.data)}
                                        </p>
                                    )}
                                    <Button type="submit" disabled={processing}>
                                        Save content
                                    </Button>
                                </>
                            )}
                        </Form>
                    )}

                    {hasFields && !collection.is_singleton && (
                        <div className="space-y-6">
                            {itemPicker.length > 1 &&
                                selectedItemId !== null && (
                                    <div className="grid max-w-md gap-2">
                                        <Label htmlFor="item_picker">
                                            Entry
                                        </Label>
                                        <select
                                            id="item_picker"
                                            className={cn(CMS_SELECT_INPUT_CLASS)}
                                            value={String(selectedItemId)}
                                            onChange={(e) => {
                                                const id = e.target.value;
                                                router.get(
                                                    cms.collections.show.url(
                                                        collection.id,
                                                    ),
                                                    { item: id },
                                                    { preserveScroll: true },
                                                );
                                            }}
                                        >
                                            {itemPicker.map((row) => (
                                                <option
                                                    key={row.id}
                                                    value={row.id}
                                                >
                                                    {row.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-muted-foreground">
                                            Switch between entries or create
                                            another from “All items”.
                                        </p>
                                    </div>
                                )}

                            {selectedItemId !== null ? (
                                <Form
                                    {...ItemController.update.form({
                                        collection: collection.id,
                                        item: selectedItemId,
                                    })}
                                    className="space-y-6"
                                    options={{ preserveScroll: true }}
                                >
                                    {({ processing, errors }) => (
                                        <>
                                            <input
                                                type="hidden"
                                                name="_from_collection_hub"
                                                value="1"
                                            />
                                            <DynamicItemFields
                                                variant="cards"
                                                fieldActions={fieldActions}
                                                fields={collection.fields}
                                                locales={locales}
                                                defaults={contentDefaults}
                                            />
                                            {errors.data && (
                                                <p className="text-sm text-destructive">
                                                    {String(errors.data)}
                                                </p>
                                            )}
                                            <Button
                                                type="submit"
                                                disabled={processing}
                                            >
                                                Save content
                                            </Button>
                                        </>
                                    )}
                                </Form>
                            ) : (
                                <Form
                                    {...ItemController.store.form({
                                        collection: collection.id,
                                    })}
                                    className="space-y-6"
                                    options={{ preserveScroll: true }}
                                >
                                    {({ processing, errors }) => (
                                        <>
                                            <input
                                                type="hidden"
                                                name="_from_collection_hub"
                                                value="1"
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                Create the first entry for this
                                                collection.
                                            </p>
                                            <DynamicItemFields
                                                variant="cards"
                                                fieldActions={fieldActions}
                                                fields={collection.fields}
                                                locales={locales}
                                                defaults={{}}
                                            />
                                            {errors.data && (
                                                <p className="text-sm text-destructive">
                                                    {String(errors.data)}
                                                </p>
                                            )}
                                            <Button
                                                type="submit"
                                                disabled={processing}
                                            >
                                                Create entry
                                            </Button>
                                        </>
                                    )}
                                </Form>
                            )}
                        </div>
                    )}
                </section>

                <Drawer
                    direction="right"
                    open={fieldDrawerOpen}
                    onOpenChange={setFieldDrawerOpen}
                >
                    <DrawerContent className="max-h-screen">
                        <DrawerHeader>
                            <DrawerTitle>Add field</DrawerTitle>
                            <DrawerDescription>
                                Choose a type and optional settings (JSON) for
                                options on select, multiselect, and radio
                                fields.
                            </DrawerDescription>
                        </DrawerHeader>

                        <Form
                            {...FieldController.store.form({
                                collection: collection.id,
                            })}
                            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                            options={{ preserveScroll: true }}
                            onSuccess={() => setFieldDrawerOpen(false)}
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="field_name">
                                            Field name
                                        </Label>
                                        <Input
                                            id="field_name"
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
                                        value={fieldType}
                                    />

                                    <div className="grid gap-2">
                                        <Label>Type</Label>
                                        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                                            {CMS_FIELD_TYPES.map((t) => (
                                                <Button
                                                    key={t.value}
                                                    type="button"
                                                    variant={
                                                        fieldType === t.value
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    className="justify-start"
                                                    onClick={() =>
                                                        setFieldType(t.value)
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
                                        <Label htmlFor="field_settings">
                                            Settings (JSON)
                                        </Label>
                                        <textarea
                                            id="field_settings"
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
                                            id="translatable"
                                            type="checkbox"
                                            name="translatable"
                                            value="1"
                                            className="size-4 rounded border"
                                        />
                                        <Label htmlFor="translatable">
                                            Translatable
                                        </Label>
                                    </div>

                                    <DrawerFooter className="flex flex-row justify-end gap-2 px-0">
                                        <DrawerClose asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                            >
                                                Cancel
                                            </Button>
                                        </DrawerClose>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
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
                    open={collectionForm.open}
                    onOpenChange={collectionForm.handleDrawerOpenChange}
                >
                    <CollectionFormDrawer
                        editing={collectionForm.editing}
                        slugManual={collectionForm.slugManual}
                        setSlugManual={collectionForm.setSlugManual}
                        form={collectionForm.form}
                        title={collectionForm.title}
                        submit={collectionForm.submit}
                    />
                </Drawer>
            </div>
        </AppLayout>
    );
}
