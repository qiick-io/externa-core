import { Form, Head, Link, router, usePage } from '@inertiajs/react';
import { Copy, History, Languages, Rows3, Save, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { ItemPreviewAsRoleDialog } from '@/components/collections/item-preview-as-role-dialog';
import type { PreviewRoleOption } from '@/components/collections/item-preview-as-role-dialog';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { ContentLocaleFlag } from '@/components/collections/content-locale-flag';
import { DynamicItemFields } from '@/components/collections/dynamic-item-fields';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { FilterSearch } from '@/components/layout/page-header';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCollection } from '@/hooks/use-collection';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { getNonFieldErrors } from '@/lib/collection-data-errors';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';
import {
    applyItemDraftToForm,
    clearItemDraft,
    readItemDraft,
    serializeItemForm,
    writeItemDraft,
} from '@/lib/item-draft-storage';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { readReturnParam } from '@/lib/safe-return-url';
import { toast } from '@/lib/toast';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import collections from '@/routes/collections';
import type { AdminActivityLogRow, BreadcrumbItem, Paginated } from '@/types';
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
    activityLogs: activityLogsProp = null,
}: {
    collection: CollectionView;
    item: ItemPayload | null;
    rawData: Record<string, unknown>;
    isNew: boolean;
    relatedCollections?: { id: number; name: string; slug: string }[];
    /** null = unrestricted; otherwise per-field read/create/update flags */
    fieldGrants?: Record<string, FieldGrant> | null;
    previewRoles?: PreviewRoleOption[];
    activityLogs?:
        | LaravelPaginated<AdminActivityLogRow>
        | Paginated<AdminActivityLogRow>
        | null;
}) {
    const { t } = useTranslation();
    const page = usePage();
    const activityLogs = activityLogsProp
        ? normalizePaginated(activityLogsProp)
        : null;
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
    const [activeTab, setActiveTab] = useState<'fields' | 'activity'>('fields');
    const [fieldSearch, setFieldSearch] = useState('');
    const [globalLocale, setGlobalLocale] = useState(locales[0] ?? 'en');
    const draftTimer = useRef<number | null>(null);

    /**
     * Apply current locale values to all locales (ponytail: DOM manipulation).
     */
    const handleApplyToAll = (): void => {
        const form = document.getElementById(
            COLLECTION_ITEM_FORM_ID,
        ) as HTMLFormElement | null;
        if (!form) {
            return;
        }

        const inputs = form.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input, textarea, select');

        for (const input of inputs) {
            const name = input.name;
            const match = name.match(/^data\[([^\]]+)\]\[([^\]]+)\]$/);
            if (!match) {
                continue;
            }

            const [, fieldName, locale] = match;
            if (locale === globalLocale) {
                // Apply this value to all other locales
                for (const targetLocale of locales) {
                    if (targetLocale === globalLocale) {
                        continue;
                    }
                    const targetName = `data[${fieldName}][${targetLocale}]`;
                    const targetInput = form.querySelector<
                        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                    >(`[name="${targetName}"]`);

                    if (targetInput) {
                        if (input.type === 'checkbox' || input.type === 'radio') {
                            (targetInput as HTMLInputElement).checked = (
                                input as HTMLInputElement
                            ).checked;
                        } else {
                            targetInput.value = input.value;
                        }
                        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        }

        setIsDirty(true);
        scheduleDraftSave();
    };

    /**
     * Apply current locale values to empty locales only (ponytail: DOM manipulation).
     */
    const handleApplyToEmpty = (): void => {
        const form = document.getElementById(
            COLLECTION_ITEM_FORM_ID,
        ) as HTMLFormElement | null;
        if (!form) {
            return;
        }

        const inputs = form.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input, textarea, select');

        for (const input of inputs) {
            const name = input.name;
            const match = name.match(/^data\[([^\]]+)\]\[([^\]]+)\]$/);
            if (!match) {
                continue;
            }

            const [, fieldName, locale] = match;
            if (locale === globalLocale) {
                // Apply this value only to empty locales
                for (const targetLocale of locales) {
                    if (targetLocale === globalLocale) {
                        continue;
                    }
                    const targetName = `data[${fieldName}][${targetLocale}]`;
                    const targetInput = form.querySelector<
                        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                    >(`[name="${targetName}"]`);

                    if (targetInput) {
                        const isEmpty = targetInput.type === 'checkbox' || targetInput.type === 'radio'
                            ? !(targetInput as HTMLInputElement).checked
                            : (targetInput.value ?? '').trim() === '';

                        if (isEmpty) {
                            if (input.type === 'checkbox' || input.type === 'radio') {
                                (targetInput as HTMLInputElement).checked = (
                                    input as HTMLInputElement
                                ).checked;
                            } else {
                                targetInput.value = input.value;
                            }
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }
            }
        }

        setIsDirty(true);
        scheduleDraftSave();
    };

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
                        <Button variant="outline" asChild>
                            <Link
                                href={`/collections/${collection.id}/items/${item.id}/revisions`}
                            >
                                <History className="size-4" />
                                Revisions
                            </Link>
                        </Button>
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
                filters={
                    activeTab === 'fields' && hasFields ? (
                        <FilterSearch
                            value={fieldSearch}
                            onChange={setFieldSearch}
                            placeholder="Search fields…"
                        />
                    ) : undefined
                }
                filtersRight={
                    <div className="flex items-center gap-2">
                        {hasFields && locales.length > 1 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 gap-2"
                                    >
                                        <ContentLocaleFlag
                                            region={contentLocaleMeta(globalLocale).flag}
                                            title={contentLocaleMeta(globalLocale).name}
                                        />
                                        <span className="font-mono text-xs uppercase">
                                            {globalLocale}
                                        </span>
                                        <Languages className="size-3.5 opacity-60" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-48">
                                    {locales.map((code) => {
                                        const meta = contentLocaleMeta(code);
                                        return (
                                            <DropdownMenuItem
                                                key={code}
                                                onClick={() => setGlobalLocale(code)}
                                                className="gap-2"
                                            >
                                                <ContentLocaleFlag region={meta.flag} />
                                                <span className="flex-1">{meta.name}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {code}
                                                </span>
                                            </DropdownMenuItem>
                                        );
                                    })}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleApplyToAll}
                                        className="gap-2"
                                    >
                                        <Copy className="size-3.5" />
                                        {t('collections.localized.applyAll')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={handleApplyToEmpty}
                                        className="gap-2"
                                    >
                                        <Copy className="size-3.5" />
                                        {t('collections.localized.applyEmpty')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {!isNew && item !== null && (
                            <ToggleGroup
                                type="single"
                                value={activeTab}
                                onValueChange={(value) => {
                                    if (value === 'fields' || value === 'activity') {
                                        setActiveTab(value);
                                    }
                                }}
                            >
                                <ToggleGroupItem
                                    value="fields"
                                    aria-label="Fields"
                                    className="px-2.5"
                                >
                                    <ScrollText className="size-4" />
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    value="activity"
                                    aria-label="Activity"
                                    className="px-2.5"
                                >
                                    <History className="size-4" />
                                </ToggleGroupItem>
                            </ToggleGroup>
                        )}
                    </div>
                }
                scrollContent
            >
                {draftBanner && (
                    <div
                        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
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
                    <>
                        {isNew ? (
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
                                onError={(errors) => {
                                    const nonFieldErrors = getNonFieldErrors(errors);
                                    if (nonFieldErrors.length > 0) {
                                        nonFieldErrors.forEach((msg) => {
                                            toast.error(msg);
                                        });
                                    }
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
                                {({ errors }) => (
                                    <DynamicItemFields
                                        variant="plain"
                                        collectionId={collection.id}
                                        fields={collection.fields}
                                        locales={locales}
                                        defaults={contentDefaults}
                                        relatedCollections={relatedCollections}
                                        formLayout={collection.form_layout}
                                        fieldGrants={fieldGrants}
                                        isNew={isNew}
                                        fieldSearch={fieldSearch}
                                        errors={errors as Record<string, unknown>}
                                        defaultLocale={globalLocale}
                                    />
                                )}
                            </Form>
                        ) : (
                            <>
                                {activeTab === 'fields' && (
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
                                        onError={(errors) => {
                                            const nonFieldErrors = getNonFieldErrors(errors);
                                            if (nonFieldErrors.length > 0) {
                                                nonFieldErrors.forEach((msg) => {
                                                    toast.error(msg);
                                                });
                                            }
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
                                        {({ errors }) => (
                                            <DynamicItemFields
                                                variant="plain"
                                                collectionId={collection.id}
                                                fields={collection.fields}
                                                locales={locales}
                                                defaults={contentDefaults}
                                                relatedCollections={relatedCollections}
                                                formLayout={collection.form_layout}
                                                fieldGrants={fieldGrants}
                                                isNew={isNew}
                                                fieldSearch={fieldSearch}
                                                errors={errors as Record<string, unknown>}
                                                defaultLocale={globalLocale}
                                            />
                                        )}
                                    </Form>
                                )}
                                {activeTab === 'activity' && item !== null && (
                                    <div className="space-y-6">
                                        <div className="rounded-lg border border-sidebar-border/70 bg-muted/30 p-4 text-sm dark:border-sidebar-border">
                                            <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
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
                                        </div>
                                        <TablePanel
                                            footer={
                                                activityLogs &&
                                                activityLogs.last_page > 1 ? (
                                                    <TablePagination
                                                        links={
                                                            activityLogs.links ??
                                                            []
                                                        }
                                                    />
                                                ) : undefined
                                            }
                                        >
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>User</TableHead>
                                                        <TableHead>Action</TableHead>
                                                        <TableHead>
                                                            Description
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {activityLogs &&
                                                    (activityLogs.data ?? [])
                                                        .length === 0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                colSpan={4}
                                                                className="text-muted-foreground"
                                                            >
                                                                No activity recorded
                                                                yet.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        (activityLogs?.data ?? []).map(
                                                            (row) => (
                                                                <TableRow
                                                                    key={row.id}
                                                                >
                                                                    <TableCell className="whitespace-nowrap text-sm">
                                                                        {row.created_at
                                                                            ? new Date(
                                                                                  row.created_at,
                                                                              ).toLocaleString()
                                                                            : '—'}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        {row.causer ? (
                                                                            <div className="text-sm">
                                                                                <div>
                                                                                    {
                                                                                        row
                                                                                            .causer
                                                                                            .name
                                                                                    }
                                                                                </div>
                                                                                <div className="text-xs text-muted-foreground">
                                                                                    {
                                                                                        row
                                                                                            .causer
                                                                                            .email
                                                                                    }
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-sm text-muted-foreground">
                                                                                System
                                                                            </span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="secondary">
                                                                            {row.event ??
                                                                                '—'}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="max-w-xs truncate text-sm">
                                                                        {
                                                                            row.description
                                                                        }
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </TablePanel>
                                    </div>
                                )}
                            </>
                        )}
                    </>
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
