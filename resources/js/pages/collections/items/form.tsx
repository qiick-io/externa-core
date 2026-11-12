import { Head, Link, usePage } from '@inertiajs/react';
import { Rows3 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { ItemChatDrawer } from '@/components/collections/item-chat-drawer';
import {
    ItemActivityPanel,
    ItemViewToggle,
} from '@/components/collections/item-form/item-activity-panel';
import { ItemFieldsForm } from '@/components/collections/item-form/item-fields-form';
import {
    ItemDraftRestoredBanner,
    ItemStaleBanner,
} from '@/components/collections/item-form/item-form-banners';
import {
    ItemStaleSaveDialog,
    ItemWorkflowDialogs,
} from '@/components/collections/item-form/item-form-dialogs';
import { ItemFormHeaderActions } from '@/components/collections/item-form/item-form-header-actions';
import {
    getItemFormElement,
    isChatRequestedInUrl,
    readItemViewParam,
    setItemSaveAction,
} from '@/components/collections/item-form/item-form-helpers';
import type {
    FieldGrant,
    ItemPayload,
    ItemSaveAction,
    ItemView,
} from '@/components/collections/item-form/item-form-helpers';
import { ItemLocaleMenu } from '@/components/collections/item-form/item-locale-menu';
import { ItemRevisionsPanel } from '@/components/collections/item-form/item-revisions-panel';
import {
    ItemScheduleFailureAlert,
    ItemSchedulePanel,
} from '@/components/collections/item-form/item-schedule-panel';
import {
    ItemVersionActionsMenu,
    ItemVersionSelect,
} from '@/components/collections/item-form/item-version-controls';
import { useItemDraftAutosave } from '@/components/collections/item-form/use-item-draft-autosave';
import { useItemOptimisticLock } from '@/components/collections/item-form/use-item-optimistic-lock';
import { useItemSaveShortcut } from '@/components/collections/item-form/use-item-save-shortcut';
import { useItemSchedule } from '@/components/collections/item-form/use-item-schedule';
import { useItemWorkflowActions } from '@/components/collections/item-form/use-item-workflow-actions';
import type { PreviewRoleOption } from '@/components/collections/item-preview-as-role-dialog';
import { FilterSearch } from '@/components/layout/page-header';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCollection } from '@/hooks/use-collection';
import { useItemPresence } from '@/hooks/use-item-presence';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import type { ItemAiDraftValue } from '@/lib/ai-item-draft';
import { draftValuesForForm } from '@/lib/ai-item-draft';
import { itemChatTitle, itemLabelFromData } from '@/lib/chat-thread-identity';
import { formatUserDisplayName } from '@/lib/format';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { readReturnParam } from '@/lib/safe-return-url';
import { toast } from '@/lib/toast';
import collections from '@/routes/collections';
import type { AdminActivityLogRow, BreadcrumbItem, Paginated } from '@/types';
import type { CollectionView } from '@/types/collections';

/**
 * Create or edit a collection item. The page wires the server props to the
 * item-form hooks (local draft, optimistic locking, schedule, workflow) and
 * lays out the header actions, sub-header controls, banners, the field form
 * or activity view, and the dialogs and drawers.
 * @returns {JSX.Element}
 */
export default function ItemsForm({
    collection,
    item,
    rawData,
    publishedData = null,
    contentVersion = 'published',
    isNew,
    relatedCollections = [],
    fieldGrants = null,
    previewRoles = [],
    activityLogs: activityLogsProp = null,
    chat_count: chatCountProp = 0,
    livePreviewConfigured = false,
    canUseAiDrafts = false,
}: {
    collection: CollectionView;
    item: ItemPayload | null;
    rawData: Record<string, unknown>;
    publishedData?: Record<string, unknown> | null;
    contentVersion?: 'published' | 'draft';
    isNew: boolean;
    relatedCollections?: { id: number; name: string; slug: string }[];
    /** null = unrestricted; otherwise per-field read/create/update flags */
    fieldGrants?: Record<string, FieldGrant> | null;
    previewRoles?: PreviewRoleOption[];
    activityLogs?:
        | LaravelPaginated<AdminActivityLogRow>
        | Paginated<AdminActivityLogRow>
        | null;
    chat_count?: number;
    livePreviewConfigured?: boolean;
    /** AI_ITEM_DRAFTS on, `ai.draft` permission and create/update on the collection. */
    canUseAiDrafts?: boolean;
}) {
    const { t } = useTranslation();
    const page = usePage();
    const { can, auth } = useCan();
    const activityLogs = activityLogsProp
        ? normalizePaginated(activityLogsProp)
        : null;
    const activeTab: ItemView =
        !isNew && item !== null ? readItemViewParam(page.url) : 'fields';

    const listHref = useMemo(() => {
        const fromReturn = readReturnParam(page.url);

        return fromReturn ?? collections.items.index.url(collection.id);
    }, [page.url, collection.id]);

    const draftItemKey = isNew ? ('new' as const) : item!.id;

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
    const [fieldSearch, setFieldSearch] = useState('');
    const [globalLocale, setGlobalLocale] = useState(locales[0] ?? 'en');
    const [revisionsOpen, setRevisionsOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(
        () => !isNew && item !== null && isChatRequestedInUrl(page.url),
    );
    const [chatCount, setChatCount] = useState(chatCountProp);
    const [revisionApply, setRevisionApply] = useState<{
        nonce: number;
        values: Record<string, unknown>;
    } | null>(null);

    const { isDraftRestored, scheduleDraftSave, clearDraft } =
        useItemDraftAutosave({
            collectionId: collection.id,
            draftItemKey,
            formKey,
            setIsDirty,
        });

    const versioningEnabled = Boolean(collection.versioning);
    const approvalsRequired = Boolean(collection.approvals_required);
    const approvalStatus = item?.approval_status ?? 'draft';
    // A new item has no published version yet; treating it as one made the create form read-only.
    const viewingPublished =
        versioningEnabled && !isNew && contentVersion === 'published';
    const hasServerDraft = Boolean(item?.has_draft);
    const showRevisionsEntry = !isNew && item !== null;
    const latestForCompare = publishedData ?? rawData;
    const canCreateItem = can(PermissionEnum.CanCreateCollections);
    const canEditItem = can(PermissionEnum.CanEditCollections);
    const canDeleteItem = can(PermissionEnum.CanDeleteCollections);
    const canSubmitItem = can(PermissionEnum.CanSubmitCollections);
    const canApproveItem = can(PermissionEnum.CanApproveCollections);
    const publishBlockedByApproval =
        approvalsRequired && approvalStatus !== 'approved';
    const showDraftVersionActions =
        !isNew &&
        item !== null &&
        versioningEnabled &&
        contentVersion === 'draft' &&
        hasServerDraft &&
        canEditItem;
    const canApproveNow =
        showDraftVersionActions &&
        approvalsRequired &&
        canApproveItem &&
        approvalStatus === 'in_review';
    const canSubmitNow =
        showDraftVersionActions &&
        approvalsRequired &&
        canSubmitItem &&
        (approvalStatus === 'draft' || approvalStatus === 'rejected');
    // View-only users (e.g. reader) must not see Save / editable controls — BE already 403s.
    const baseFormReadonly =
        viewingPublished || (isNew ? !canCreateItem : !canEditItem);

    const presence = useItemPresence({
        enabled: !isNew && item !== null,
        collectionId: collection.id,
        itemId: item?.id ?? 0,
        viewerId: auth.user?.id ?? 0,
        viewerName: auth.user
            ? formatUserDisplayName(auth.user.first_name, auth.user.last_name)
            : '',
        loadedUpdatedAt: item?.updated_at ?? null,
        canClaimLock: !isNew && !baseFormReadonly,
    });

    const formReadonly = baseFormReadonly || presence.lockedByOther;
    const optimisticLock = useItemOptimisticLock({
        isNew,
        updatedAt: item?.updated_at,
        isDirty,
        remoteUpdatedAt: presence.remoteUpdatedAt,
    });
    const schedule = useItemSchedule({
        collectionId: collection.id,
        itemId: item?.id ?? 0,
        publishAt: item?.publish_at,
        unpublishAt: item?.unpublish_at,
        contentVersion,
        isViewingPublished: viewingPublished,
    });
    const workflow = useItemWorkflowActions({
        collectionId: collection.id,
        itemId: item?.id ?? 0,
    });
    const showCreateNew = !collection.is_singleton;
    const showCopy = !isNew && !collection.is_singleton && canCreateItem;

    const [previousItemProps, setPreviousItemProps] = useState({
        chatCountProp,
        isNew,
        item,
        pageUrl: page.url,
    });

    // Adopt fresh server props during render (React's "adjust state on prop
    // change" pattern), each one only when its own source changed.
    if (
        previousItemProps.chatCountProp !== chatCountProp ||
        previousItemProps.isNew !== isNew ||
        previousItemProps.item !== item ||
        previousItemProps.pageUrl !== page.url
    ) {
        setPreviousItemProps({
            chatCountProp,
            isNew,
            item,
            pageUrl: page.url,
        });

        if (previousItemProps.chatCountProp !== chatCountProp) {
            setChatCount(chatCountProp);
        }

        // Deep links (`?chat=1`, `?comments=1`) open the chat drawer.
        if (
            (previousItemProps.isNew !== isNew ||
                previousItemProps.item !== item ||
                previousItemProps.pageUrl !== page.url) &&
            !isNew &&
            item !== null &&
            isChatRequestedInUrl(page.url)
        ) {
            setChatOpen(true);
        }
    }

    const discardItemChanges = useCallback(() => {
        setIsDirty(false);
        clearDraft();
        setFormKey((key) => key + 1);
    }, [clearDraft, setIsDirty]);

    const submitSave = useCallback((action: ItemSaveAction) => {
        setItemSaveAction(action)?.requestSubmit();
    }, []);

    /** Mark the form dirty after an edit and keep the local draft. */
    const markFormEdited = (): void => {
        setIsDirty(true);
        scheduleDraftSave();
    };

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty,
        onDiscard: discardItemChanges,
    });

    useItemSaveShortcut({
        isEnabled: !formReadonly && hasFields,
        showCreateNew,
        submitSave,
    });

    const applyAiDraft = (
        draft: Record<string, ItemAiDraftValue>,
        draftLocale: string,
    ): void => {
        setRevisionApply({
            nonce: Date.now(),
            values: draftValuesForForm(
                collection.fields ?? [],
                draft,
                draftLocale,
                locales,
                getItemFormElement(),
            ),
        });
        markFormEdited();
        toast.success(t('collections.aiDraft.applied'));
    };

    const applyRevision = (values: Record<string, unknown>): void => {
        if (formReadonly) {
            toast.error('Switch to Draft before applying a revision.');

            return;
        }

        setRevisionApply({
            nonce: Date.now(),
            values,
        });
        markFormEdited();
        toast.success('Revision applied to the form. Save to keep.');
    };

    const lastCrumb: BreadcrumbItem = isNew
        ? {
              title: t('collections.items.list.newItem'),
              href: collections.items.new.url(collection.id),
          }
        : {
              title: t('nav.itemNumber', { id: item!.id }),
              href: collections.items.show.url({
                  collection: collection.id,
                  item: item!.id,
              }),
          };

    const breadcrumbs: BreadcrumbItem[] = [
        ...collectionBreadcrumbs,
        {
            title: t('nav.items'),
            href: listHref,
        },
        lastCrumb,
    ];

    const pageTitle = isNew
        ? `New item — ${collection.name}`
        : `Item #${item!.id} — ${collection.name}`;

    // One element for both branches below: the create form and the edit form
    // still sit at different tree positions, so turning a new item into a
    // saved one remounts the form, as before the split.
    const fieldsForm = (
        <ItemFieldsForm
            key={formKey}
            collection={collection}
            itemId={item?.id ?? null}
            isNew={isNew}
            locales={locales}
            contentDefaults={contentDefaults}
            relatedCollections={relatedCollections}
            fieldGrants={fieldGrants}
            fieldSearch={fieldSearch}
            globalLocale={globalLocale}
            formReadonly={formReadonly}
            revisionApply={revisionApply}
            versioningEnabled={versioningEnabled}
            contentVersion={contentVersion}
            expectedUpdatedAt={optimisticLock.expectedUpdatedAt}
            lockedByOther={presence.lockedByOther}
            lockHolderName={presence.lock?.name}
            onSaved={() => {
                setIsDirty(false);
                clearDraft();
            }}
            onEdited={markFormEdited}
        />
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <ItemFormHeaderActions
                    collection={collection}
                    item={item}
                    isNew={isNew}
                    previewRoles={previewRoles}
                    livePreviewConfigured={livePreviewConfigured}
                    versioningEnabled={versioningEnabled}
                    contentVersion={contentVersion}
                    hasFields={hasFields}
                    canCreateItem={canCreateItem}
                    canEditItem={canEditItem}
                    canDeleteItem={canDeleteItem}
                    canUseAiDrafts={canUseAiDrafts}
                    formReadonly={formReadonly}
                    locales={locales}
                    globalLocale={globalLocale}
                    onApplyAiDraft={applyAiDraft}
                    chatCount={chatCount}
                    onOpenChat={() => setChatOpen(true)}
                    showRevisionsEntry={showRevisionsEntry}
                    onOpenRevisions={() => setRevisionsOpen(true)}
                    onOpenDelete={() => workflow.setIsDeleteOpen(true)}
                    presence={presence}
                    isDirty={isDirty}
                    showCreateNew={showCreateNew}
                    showCopy={showCopy}
                    submitSave={submitSave}
                    onDiscardChanges={discardItemChanges}
                />
            }
        >
            <Head title={pageTitle} />

            <PageLayout
                filters={
                    hasFields ? (
                        // Activity view keeps the slot (invisible, out of the tab order) so the sub-header controls don't move (#465).
                        <FilterSearch
                            value={fieldSearch}
                            onChange={setFieldSearch}
                            placeholder={t('collections.searchFields')}
                            className={
                                activeTab === 'activity'
                                    ? 'invisible'
                                    : undefined
                            }
                        />
                    ) : undefined
                }
                filtersRight={
                    <div className="flex items-center gap-2">
                        {!isNew && item !== null && versioningEnabled && (
                            <ItemVersionSelect
                                collectionId={collection.id}
                                item={item}
                                contentVersion={contentVersion}
                                approvalsRequired={approvalsRequired}
                                approvalStatus={approvalStatus}
                                hasServerDraft={hasServerDraft}
                            />
                        )}
                        {showDraftVersionActions && item !== null ? (
                            <ItemVersionActionsMenu
                                item={item}
                                canApproveNow={canApproveNow}
                                canSubmitNow={canSubmitNow}
                                publishBlockedByApproval={
                                    publishBlockedByApproval
                                }
                                workflow={workflow}
                            />
                        ) : null}
                        {hasFields && locales.length > 1 && (
                            <ItemLocaleMenu
                                fields={collection.fields}
                                locales={locales}
                                contentDefaults={contentDefaults}
                                globalLocale={globalLocale}
                                onGlobalLocaleChange={setGlobalLocale}
                                formReadonly={formReadonly}
                                onLocaleValuesApplied={markFormEdited}
                            />
                        )}
                        {!isNew && item !== null && (
                            <ItemViewToggle activeTab={activeTab} />
                        )}
                    </div>
                }
                scrollContent
            >
                {isDraftRestored && (
                    <ItemDraftRestoredBanner onDiscard={discardItemChanges} />
                )}

                {!isNew && item !== null && optimisticLock.isRemoteStale ? (
                    <ItemStaleBanner />
                ) : null}

                {!isNew &&
                item !== null &&
                versioningEnabled &&
                canEditItem &&
                item.schedule_error ? (
                    <ItemScheduleFailureAlert
                        scheduleError={item.schedule_error}
                        unpublishAt={item.unpublish_at}
                    />
                ) : null}

                {!isNew &&
                    item !== null &&
                    versioningEnabled &&
                    canEditItem &&
                    activeTab === 'fields' && (
                        <ItemSchedulePanel
                            item={item}
                            viewingPublished={viewingPublished}
                            schedule={schedule}
                        />
                    )}

                {!hasFields && (
                    <PageEmptyState
                        icon={Rows3}
                        title={t('emptyState.fields.title')}
                        description={t('emptyState.fields.description')}
                        action={
                            <Button asChild>
                                <Link
                                    href={FieldController.index.url(
                                        collection.id,
                                    )}
                                >
                                    {t('emptyState.fields.cta')}
                                </Link>
                            </Button>
                        }
                        docsHref="https://docs.qiick.io/externa"
                        docsLabel={t('common.learnMore')}
                    />
                )}

                {hasFields && (
                    <>
                        {isNew ? (
                            fieldsForm
                        ) : (
                            <>
                                {activeTab === 'fields' && fieldsForm}
                                {activeTab === 'activity' && item !== null && (
                                    <ItemActivityPanel
                                        item={item}
                                        activityLogs={activityLogs}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </PageLayout>

            {!isNew && item !== null && (
                <ItemStaleSaveDialog
                    open={optimisticLock.isStaleSaveOpen}
                    onOpenChange={optimisticLock.setIsStaleSaveOpen}
                    onSaveAnyway={optimisticLock.saveAnyway}
                />
            )}

            {!isNew && item !== null && (
                <ItemWorkflowDialogs
                    item={item}
                    versioningEnabled={versioningEnabled}
                    approvalStatus={approvalStatus}
                    workflow={workflow}
                />
            )}

            {!isNew && item !== null && (
                <ItemChatDrawer
                    open={chatOpen}
                    onOpenChange={setChatOpen}
                    collectionId={collection.id}
                    itemId={item.id}
                    fields={collection.fields}
                    chatCount={chatCount}
                    onChatCountChange={setChatCount}
                    thread={{
                        id: `item-${item.id}`,
                        kind: 'item',
                        title: itemChatTitle(
                            collection.name,
                            itemLabelFromData(rawData, item.id),
                        ),
                        collection_id: collection.id,
                        collection_name: collection.name,
                        collection_icon: collection.icon ?? null,
                        collection_color: collection.color ?? null,
                        participants: [],
                    }}
                />
            )}

            {!isNew && item !== null && (
                <ItemRevisionsPanel
                    collection={collection}
                    itemId={item.id}
                    locales={locales}
                    relatedCollections={relatedCollections}
                    latestData={
                        contentVersion === 'draft' ? rawData : latestForCompare
                    }
                    open={revisionsOpen}
                    onOpenChange={setRevisionsOpen}
                    canRestore={canEditItem}
                    canApplyToForm={!formReadonly}
                    onApplyRevision={applyRevision}
                />
            )}
        </AppLayout>
    );
}
