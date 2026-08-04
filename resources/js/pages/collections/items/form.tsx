import { Form, Head, Link, router, usePage } from '@inertiajs/react';
import { History, Rows3, Save, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { ItemPreviewAsRoleDialog } from '@/components/collections/item-preview-as-role-dialog';
import type { PreviewRoleOption } from '@/components/collections/item-preview-as-role-dialog';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import { PageLayout } from '@/components/layout/page-layout';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/hooks/use-collection';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { collectCollectionDataErrorMessages } from '@/lib/collection-data-errors';
import {
    applyItemDraftToForm,
    clearItemDraft,
    readItemDraft,
    serializeItemForm,
    writeItemDraft,
} from '@/lib/item-draft-storage';
import { readReturnParam } from '@/lib/safe-return-url';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import collections from '@/routes/collections';
import type { BreadcrumbItem } from '@/types';
import type { CollectionView } from '@/types/collections';

const COLLECTION_ITEM_FORM_ID = 'collection-item-form';
const DRAFT_DEBOUNCE_MS = 800;

type FieldGrant = { read: boolean; create: boolean; update: boolean };

type ItemPayload = {
    id: number;
    data: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
    user_created?: { id: number; name: string; email?: string | null } | null;
    user_updated?: { id: number; name: string; email?: string | null } | null;
};

/**
 * Create or edit a collection item.
 * @returns {JSX.Element}
 */
export default function ItemsForm({
    collection,
    item,
    rawData,
    isNew,
    relatedCollections = [],
    fieldGrants = null,
    previewRoles = [],
}: {
    collection: CollectionView;
    item: ItemPayload | null;
    rawData: Record<string, unknown>;
    isNew: boolean;
    relatedCollections?: { id: number; name: string; slug: string }[];
    /** null = unrestricted; otherwise per-field read/create/update flags */
    fieldGrants?: Record<string, FieldGrant> | null;
    previewRoles?: PreviewRoleOption[];
}) {
    const page = usePage();
    const listHref = useMemo(() => {
        const fromReturn = readReturnParam(page.url);
        return fromReturn ?? collections.items.index.url(collection.id);
    }, [page.url, collection.id]);

    const draftItemKey = isNew ? ('new' as const) : item!.id;
    const initialDraft = useMemo(
        () => readItemDraft(collection.id, draftItemKey),
        // one-shot on mount for this item
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [collection.id, draftItemKey],
    );

    const {
        locales,
        breadcrumbs: collectionBreadcrumbs,
        contentDefaults,
        hasFields,
    } = useCollection({
        collection,
        singletonRawData: null,
        editableRawData: rawData,
    });

    const [isDirty, setIsDirty] = useState(false);
    const [formKey, setFormKey] = useState(0);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [draftBanner, setDraftBanner] = useState(
        () => initialDraft !== null && Object.keys(initialDraft).length > 0,
    );
    const draftTimer = useRef<number | null>(null);

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: () => {
            setIsDirty(false);
            clearItemDraft(collection.id, draftItemKey);
            setDraftBanner(false);
            setFormKey((key) => key + 1);
        },
    });

    useEffect(() => {
        if (!draftBanner || !initialDraft) {
            return;
        }
        const form = document.getElementById(
            COLLECTION_ITEM_FORM_ID,
        ) as HTMLFormElement | null;
        if (!form) {
            return;
        }
        applyItemDraftToForm(form, initialDraft);
        setIsDirty(true);
    }, [draftBanner, initialDraft, formKey]);

    const scheduleDraftSave = (): void => {
        if (draftTimer.current) {
            window.clearTimeout(draftTimer.current);
        }
        draftTimer.current = window.setTimeout(() => {
            const form = document.getElementById(
                COLLECTION_ITEM_FORM_ID,
            ) as HTMLFormElement | null;
            if (!form) {
                return;
            }
            writeItemDraft(
                collection.id,
                draftItemKey,
                serializeItemForm(form),
            );
        }, DRAFT_DEBOUNCE_MS);
    };

    useEffect(() => {
        return () => {
            if (draftTimer.current) {
                window.clearTimeout(draftTimer.current);
            }
        };
    }, []);

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
            href: listHref,
        },
        lastCrumb,
    ];

    const pageTitle = isNew
        ? `New item — ${collection.name}`
        : `Item #${item!.id} — ${collection.name}`;

    const heading = isNew ? 'New item' : `Item #${item!.id}`;

    const formProps = isNew
        ? wayfinderInertiaFormProps(
              ItemController.store,
              { collection: collection.id },
              'post',
          )
        : wayfinderInertiaFormProps(
              ItemController.update,
              {
                  collection: collection.id,
                  item: item!.id,
              },
              'put',
          );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    {!isNew && item !== null && (
                        <ItemPreviewAsRoleDialog
                            collectionId={collection.id}
                            itemId={item.id}
                            roles={previewRoles}
                        />
                    )}
                    {!isNew && item !== null && (
                        <>
                            <Button variant="outline" asChild>
                                <Link
                                    href={`/collections/${collection.id}/items/${item.id}/revisions`}
                                >
                                    <History className="size-4" />
                                    Revisions
                                </Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link
                                    href={adminRoutes.activityLogs.index({
                                        query: {
                                            subject_type:
                                                'App\\Models\\CollectionItem',
                                            subject_id: item.id,
                                        },
                                    })}
                                >
                                    <ScrollText className="size-4" />
                                    Activity
                                </Link>
                            </Button>
                        </>
                    )}
                    <Button variant="outline" asChild>
                        <Link href={FieldController.index.url(collection.id)}>
                            <Rows3 className="size-4" />
                            Edit fields
                        </Link>
                    </Button>
                    {!isNew && item !== null && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => setDeleteOpen(true)}
                        >
                            <Trash2 className="size-4" />
                            Delete
                        </Button>
                    )}
                    <UnsavedChangesToolbar
                        isDirty={isDirty}
                        className="flex items-center gap-2"
                    />
                    {hasFields && (
                        <Button type="submit" form={COLLECTION_ITEM_FORM_ID}>
                            <Save className="size-4" />
                            {isNew ? 'Create' : 'Save'}
                        </Button>
                    )}
                </>
            }
        >
            <Head title={pageTitle} />

            <PageLayout
                description={
                    <>
                        {heading} · {collection.slug}.{' '}
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
                    </>
                }
                scrollContent
            >
                {draftBanner && (
                    <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
                        data-test="item-draft-banner"
                    >
                        <span>Restored unsaved draft from this browser.</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-test="discard-item-draft"
                            onClick={() => {
                                clearItemDraft(collection.id, draftItemKey);
                                setDraftBanner(false);
                                setIsDirty(false);
                                setFormKey((key) => key + 1);
                            }}
                        >
                            Discard draft
                        </Button>
                    </div>
                )}

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
                        key={formKey}
                        {...formProps}
                        id={COLLECTION_ITEM_FORM_ID}
                        className="space-y-6"
                        options={{ preserveScroll: true }}
                        onSuccess={() => {
                            setIsDirty(false);
                            clearItemDraft(collection.id, draftItemKey);
                            setDraftBanner(false);
                        }}
                        onInput={() => {
                            setIsDirty(true);
                            scheduleDraftSave();
                        }}
                        onChange={() => {
                            setIsDirty(true);
                            scheduleDraftSave();
                        }}
                    >
                        {({ errors }) => {
                            const dataErrors =
                                collectCollectionDataErrorMessages(
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
                                        formLayout={collection.form_layout}
                                        fieldGrants={fieldGrants}
                                        isNew={isNew}
                                    />
                                    {!isNew && item !== null && (
                                        <dl className="grid gap-3 border-t pt-6 text-sm text-muted-foreground sm:grid-cols-2">
                                            <div>
                                                <dt className="font-medium text-foreground">
                                                    Created by
                                                </dt>
                                                <dd>
                                                    {item.user_created?.name ??
                                                        '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="font-medium text-foreground">
                                                    Updated by
                                                </dt>
                                                <dd>
                                                    {item.user_updated?.name ??
                                                        '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="font-medium text-foreground">
                                                    Created at
                                                </dt>
                                                <dd>
                                                    {item.created_at
                                                        ? new Date(
                                                              item.created_at,
                                                          ).toLocaleString()
                                                        : '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="font-medium text-foreground">
                                                    Updated at
                                                </dt>
                                                <dd>
                                                    {item.updated_at
                                                        ? new Date(
                                                              item.updated_at,
                                                          ).toLocaleString()
                                                        : '—'}
                                                </dd>
                                            </div>
                                        </dl>
                                    )}
                                </>
                            );
                        }}
                    </Form>
                )}
            </PageLayout>

            {!isNew && item !== null && (
                <ConfirmDestructiveDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title="Delete item?"
                    description="This item will be soft-deleted and removed from the active list."
                    confirming={deleting}
                    onConfirm={() => {
                        setDeleting(true);
                        router.delete(
                            ItemController.destroy.url({
                                collection: collection.id,
                                item: item.id,
                            }),
                            {
                                onFinish: () => setDeleting(false),
                                onError: () => setDeleteOpen(false),
                            },
                        );
                    }}
                />
            )}
        </AppLayout>
    );
}
