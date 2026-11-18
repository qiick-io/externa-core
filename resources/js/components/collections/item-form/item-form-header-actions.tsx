import { Link } from '@inertiajs/react';
import {
    Check,
    CheckCheck,
    ChevronDown,
    History,
    MessageCircle,
    Plus,
    RotateCcw,
    Rows3,
    Save,
    Trash2,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { ItemAiDraftDialog } from '@/components/collections/item-ai-draft-dialog';
import { ItemEditingPresence } from '@/components/collections/item-editing-presence';
import {
    COLLECTION_ITEM_FORM_ID,
    itemSaveShortcut,
    setItemSaveAction,
} from '@/components/collections/item-form/item-form-helpers';
import type {
    ItemPayload,
    ItemSaveAction,
} from '@/components/collections/item-form/item-form-helpers';
import { ItemLivePreviewButton } from '@/components/collections/item-live-preview-button';
import type { PreviewRoleOption } from '@/components/collections/item-preview-as-role-dialog';
import { ItemPreviewAsRoleDialog } from '@/components/collections/item-preview-as-role-dialog';
import { ShortcutKeys } from '@/components/collections/shortcut-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ButtonGroup,
    ButtonGroupSeparator,
} from '@/components/ui/button-group';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';
import type { useItemPresence } from '@/hooks/use-item-presence';
import type { CollectionView } from '@/types/collections';

/**
 * Header actions of the item page, left to right: preview as role, live
 * preview, AI draft, chat, revisions, edit fields, delete, editing presence,
 * the unsaved-changes hint and the save split button.
 */
export function ItemFormHeaderActions({
    collection,
    item,
    isNew,
    previewRoles,
    livePreviewConfigured,
    versioningEnabled,
    contentVersion,
    hasFields,
    canCreateItem,
    canEditItem,
    canDeleteItem,
    canUseAiDrafts,
    formReadonly,
    locales,
    globalLocale,
    onApplyAiDraft,
    chatCount,
    onOpenChat,
    showRevisionsEntry,
    onOpenRevisions,
    onOpenDelete,
    presence,
    isDirty,
    showCreateNew,
    showCopy,
    submitSave,
    onDiscardChanges,
}: {
    collection: CollectionView;
    item: ItemPayload | null;
    isNew: boolean;
    previewRoles: PreviewRoleOption[];
    livePreviewConfigured: boolean;
    versioningEnabled: boolean;
    contentVersion: 'published' | 'draft';
    hasFields: boolean;
    canCreateItem: boolean;
    canEditItem: boolean;
    canDeleteItem: boolean;
    canUseAiDrafts: boolean;
    formReadonly: boolean;
    locales: string[];
    globalLocale: string;
    onApplyAiDraft: ComponentProps<typeof ItemAiDraftDialog>['onApply'];
    chatCount: number;
    onOpenChat: () => void;
    showRevisionsEntry: boolean;
    onOpenRevisions: () => void;
    onOpenDelete: () => void;
    presence: ReturnType<typeof useItemPresence>;
    isDirty: boolean;
    showCreateNew: boolean;
    showCopy: boolean;
    submitSave: (action: ItemSaveAction) => void;
    onDiscardChanges: () => void;
}) {
    const { t } = useTranslation();

    return (
        <>
            {!isNew && item !== null && (
                <ItemPreviewAsRoleDialog
                    collectionId={collection.id}
                    itemId={item.id}
                    roles={previewRoles}
                />
            )}
            {!isNew && item !== null && livePreviewConfigured && (
                <ItemLivePreviewButton
                    collectionId={collection.id}
                    itemId={item.id}
                    version={versioningEnabled ? contentVersion : 'published'}
                />
            )}
            {isNew && hasFields && canCreateItem && livePreviewConfigured && (
                <ItemLivePreviewButton
                    collectionId={collection.id}
                    itemId={null}
                    formId={COLLECTION_ITEM_FORM_ID}
                    version="draft"
                />
            )}
            {canUseAiDrafts && !formReadonly && (
                <ItemAiDraftDialog
                    collectionId={collection.id}
                    fields={collection.fields ?? []}
                    locales={locales}
                    defaultLocale={globalLocale}
                    onApply={onApplyAiDraft}
                />
            )}
            {!isNew && item !== null && (
                <HeaderIconButton
                    type="button"
                    label={t('collections.itemToolbar.chat')}
                    className="relative"
                    data-test="open-chat-drawer"
                    onClick={onOpenChat}
                >
                    <MessageCircle className="size-4" />
                    {chatCount > 0 ? (
                        <Badge className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 tabular-nums">
                            {chatCount > 9 ? '9+' : chatCount}
                        </Badge>
                    ) : null}
                </HeaderIconButton>
            )}
            {showRevisionsEntry && (
                <HeaderIconButton
                    type="button"
                    label={t('collections.itemToolbar.revisions')}
                    data-test="open-revisions-drawer"
                    onClick={onOpenRevisions}
                >
                    <History className="size-4" />
                </HeaderIconButton>
            )}
            {canEditItem && (
                <HeaderIconButton
                    asChild
                    label={t('collections.itemToolbar.editFields')}
                >
                    <Link href={FieldController.index.url(collection.id)}>
                        <Rows3 className="size-4" />
                    </Link>
                </HeaderIconButton>
            )}
            {!isNew && item !== null && canDeleteItem && (
                <HeaderIconButton
                    type="button"
                    label={t('collections.itemToolbar.delete')}
                    className="text-destructive hover:text-destructive"
                    onClick={onOpenDelete}
                >
                    <Trash2 className="size-4" />
                </HeaderIconButton>
            )}
            {!isNew && item !== null ? (
                <ItemEditingPresence
                    editors={presence.editors}
                    lockedByOther={presence.lockedByOther}
                    lockHolderName={presence.lock?.name ?? null}
                    onTakeOver={presence.takeOverLock}
                />
            ) : null}
            <UnsavedChangesToolbar
                isDirty={isDirty && !formReadonly}
                className="flex items-center gap-2"
            />
            {hasFields && !formReadonly && (
                <ItemSaveSplitButton
                    isNew={isNew}
                    isDraftVersion={
                        versioningEnabled && contentVersion === 'draft'
                    }
                    showCreateNew={showCreateNew}
                    showCopy={showCopy}
                    submitSave={submitSave}
                    onDiscardChanges={onDiscardChanges}
                />
            )}
        </>
    );
}

/**
 * Primary save button (create / save / save draft) with a menu for "save and
 * stay", "save and create new", "save as copy" and "discard changes".
 */
function ItemSaveSplitButton({
    isNew,
    isDraftVersion,
    showCreateNew,
    showCopy,
    submitSave,
    onDiscardChanges,
}: {
    isNew: boolean;
    isDraftVersion: boolean;
    showCreateNew: boolean;
    showCopy: boolean;
    submitSave: (action: ItemSaveAction) => void;
    onDiscardChanges: () => void;
}) {
    const { t } = useTranslation();

    return (
        <ButtonGroup data-test="item-save-split">
            <Button
                type="submit"
                form={COLLECTION_ITEM_FORM_ID}
                onClick={() => setItemSaveAction('stay')}
            >
                <Save className="size-4" />
                {isNew
                    ? t('collections.itemSave.create')
                    : isDraftVersion
                      ? t('collections.itemSave.saveDraft')
                      : t('collections.itemSave.save')}
            </Button>
            <ButtonGroupSeparator className="bg-primary-foreground/25" />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="icon"
                        aria-label={t('collections.itemSave.more')}
                        data-test="item-save-menu"
                    >
                        <ChevronDown className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => submitSave('stay')}>
                        <Check className="size-4" />
                        {t('collections.itemSave.stay')}
                        <DropdownMenuShortcut>
                            <ShortcutKeys keys={itemSaveShortcut(false)} />
                        </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    {showCreateNew ? (
                        <DropdownMenuItem
                            onSelect={() => submitSave('create_new')}
                        >
                            <Plus className="size-4" />
                            {t('collections.itemSave.createNew')}
                            <DropdownMenuShortcut>
                                <ShortcutKeys keys={itemSaveShortcut(true)} />
                            </DropdownMenuShortcut>
                        </DropdownMenuItem>
                    ) : null}
                    {showCopy ? (
                        <DropdownMenuItem onSelect={() => submitSave('copy')}>
                            <CheckCheck className="size-4" />
                            {t('collections.itemSave.copy')}
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDiscardChanges()}>
                        <RotateCcw className="size-4" />
                        {t('collections.itemSave.discard')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </ButtonGroup>
    );
}
