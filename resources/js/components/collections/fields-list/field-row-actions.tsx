import { router } from '@inertiajs/react';
import {
    Columns2,
    Copy,
    Eye,
    EyeOff,
    Maximize2,
    MoreHorizontal,
    Pencil,
    Plus,
    StretchHorizontal,
    Trash2,
    Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import FieldLayoutController from '@/actions/App/Http/Controllers/Collections/FieldLayoutController';
import { FieldConvertDialog } from '@/components/collections/field-convert-dialog';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    getFieldGroupName,
    isLayoutGroupType,
    isPanelContainerType,
} from '@/lib/collection-field-groups';
import {
    FIELD_LAYOUT_WIDTH_OPTIONS,
    fieldLayoutWidthLabel,
    getFieldLayoutWidth,
    isFieldHiddenInForm,
} from '@/lib/collection-field-types';
import type { FieldLayoutWidth } from '@/lib/collection-field-types';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

function uniqueFieldName(used: Set<string>, base: string): string {
    if (!used.has(base)) {
        return base;
    }

    let suffix = 2;

    while (used.has(`${base}_${suffix}`)) {
        suffix++;
    }

    return `${base}_${suffix}`;
}

/**
 * Create a Raw section/tab under Accordion/Tabs (nest group-raw).
 */
function createPanelSectionField(
    collectionId: number,
    parent: CollectionFieldRow,
    allFields: CollectionFieldRow[],
): void {
    if (!isPanelContainerType(parent.type)) {
        return;
    }

    const childCount = allFields.filter(
        (field) => getFieldGroupName(field) === parent.name,
    ).length;
    const index = childCount + 1;
    const isTabs = parent.type === 'group_tabs';
    const baseName = isTabs
        ? `${parent.name}_tab_${index}`
        : `${parent.name}_section_${index}`;
    const used = new Set(allFields.map((field) => field.name));
    const name = uniqueFieldName(used, baseName);

    router.post(
        FieldController.store.url(collectionId),
        {
            name,
            type: 'group_raw',
            translatable: false,
            settings: {
                layout_width: 'full',
                group: parent.name,
                display_name: isTabs
                    ? {
                          en: `Tab ${index}`,
                          it: `Scheda ${index}`,
                          de: `Tab ${index}`,
                      }
                    : {
                          en: `Section ${index}`,
                          it: `Sezione ${index}`,
                          de: `Abschnitt ${index}`,
                      },
            },
        },
        { preserveScroll: true },
    );
}

/** Menu icon per field layout width. */
const LAYOUT_WIDTH_ICONS: Record<FieldLayoutWidth, LucideIcon> = {
    half: Columns2,
    full: Maximize2,
    fill: StretchHorizontal,
};

/**
 * Overflow menu of one field row: edit, convert, duplicate, add a panel section,
 * form visibility, layout width and delete (with its confirm and convert dialogs).
 */
export function CollectionFieldRowActions({
    field,
    collectionId,
    onEdit,
    allFields,
}: {
    field: CollectionFieldRow;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
}) {
    const { t } = useTranslation();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);
    const isGroup = isLayoutGroupType(field.type);
    const isPanel = isPanelContainerType(field.type);

    const duplicateField = (): void => {
        router.post(
            FieldController.duplicate.url({
                collection: collectionId,
                field: field.id,
            }),
            {},
            { preserveScroll: true },
        );
    };

    const toggleFormVisibility = (): void => {
        router.post(
            FieldLayoutController.toggleFormVisibility.url({
                collection: collectionId,
                field: field.id,
            }),
            {},
            { preserveScroll: true },
        );
    };

    const updateLayoutWidth = (nextLayoutWidth: FieldLayoutWidth): void => {
        router.post(
            FieldLayoutController.updateLayoutWidth.url({
                collection: collectionId,
                field: field.id,
            }),
            { layout_width: nextLayoutWidth },
            { preserveScroll: true },
        );
    };

    const deleteField = (): void => {
        setDeleting(true);
        router.delete(
            FieldController.destroy.url({
                collection: collectionId,
                field: field.id,
            }),
            {
                preserveScroll: true,
                onFinish: () => setDeleting(false),
                onSuccess: () => setDeleteOpen(false),
                onError: () => {
                    toast.error(t('collections.fieldMenu.deleteFailed'));
                    setDeleteOpen(false);
                },
            },
        );
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={t('a11y.fieldActions')}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit(field);
                        }}
                    >
                        <Pencil className="size-4" />
                        {t('collections.fieldMenu.edit')}
                    </DropdownMenuItem>
                    {field.has_stored_values && !isGroup ? (
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                setConvertOpen(true);
                            }}
                        >
                            <Type className="size-4" />
                            {t('collections.convert.menuLabel')}
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                        onClick={(event) => {
                            event.stopPropagation();
                            duplicateField();
                        }}
                    >
                        <Copy className="size-4" />
                        {t('collections.fieldMenu.duplicate')}
                    </DropdownMenuItem>
                    {isPanel ? (
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                createPanelSectionField(
                                    collectionId,
                                    field,
                                    allFields,
                                );
                            }}
                        >
                            <Plus className="size-4" />
                            {field.type === 'group_tabs'
                                ? t('collections.groups.addTab')
                                : t('collections.groups.addSection')}
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleFormVisibility();
                        }}
                    >
                        {hiddenInForm ? (
                            <Eye className="size-4" />
                        ) : (
                            <EyeOff className="size-4" />
                        )}
                        {hiddenInForm
                            ? t('collections.fieldMenu.showInForm')
                            : t('collections.fieldMenu.hideInForm')}
                    </DropdownMenuItem>
                    {!isGroup && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>
                                {t('collections.fieldMenu.width')}
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={layoutWidth}
                                onValueChange={(next) =>
                                    updateLayoutWidth(next as FieldLayoutWidth)
                                }
                            >
                                {FIELD_LAYOUT_WIDTH_OPTIONS.map((width) => {
                                    const WidthIcon = LAYOUT_WIDTH_ICONS[width];

                                    return (
                                        <DropdownMenuRadioItem
                                            key={width}
                                            value={width}
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                        >
                                            <WidthIcon className="size-4" />
                                            {fieldLayoutWidthLabel(width, t)}
                                        </DropdownMenuRadioItem>
                                    );
                                })}
                            </DropdownMenuRadioGroup>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onClick={(event) => {
                            event.stopPropagation();
                            setDeleteOpen(true);
                        }}
                    >
                        <Trash2 className="size-4" />
                        {t('collections.fieldMenu.delete')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmDestructiveDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t('fieldConfirm.deleteTitle', { name: field.name })}
                description={t('fieldConfirm.deleteDescription')}
                confirming={deleting}
                onConfirm={deleteField}
            />

            {field.has_stored_values && !isGroup ? (
                <FieldConvertDialog
                    open={convertOpen}
                    onOpenChange={setConvertOpen}
                    collectionId={collectionId}
                    field={field}
                />
            ) : null}
        </>
    );
}

/**
 * Add-tab / add-section button under an Accordion or Tabs container, or the
 * drop hint inside an empty plain group.
 */
export function PanelAddSectionControl({
    parent,
    collectionId,
    allFields,
    empty,
}: {
    parent: CollectionFieldRow;
    collectionId: number;
    allFields: CollectionFieldRow[];
    empty: boolean;
}) {
    const { t } = useTranslation();
    const isTabs = parent.type === 'group_tabs';
    const isPanel = isPanelContainerType(parent.type);
    const label = isTabs
        ? t('collections.groups.addTab')
        : t('collections.groups.addSection');

    if (!isPanel) {
        return empty ? (
            <p className="px-2 py-2 text-center text-sm text-muted-foreground">
                {t('collections.groups.dropIntoSection')}
            </p>
        ) : null;
    }

    return (
        <div
            className={cn(
                'flex flex-col items-center gap-2 px-2',
                empty ? 'py-3' : 'pt-1 pb-1',
            )}
        >
            {empty ? (
                <p className="text-center text-sm text-muted-foreground">
                    {isTabs
                        ? t('collections.groups.emptyTabsHint')
                        : t('collections.groups.emptyPanelHint')}
                </p>
            ) : null}
            <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={(event) => {
                    event.stopPropagation();
                    createPanelSectionField(collectionId, parent, allFields);
                }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <Plus className="size-4" />
                {label}
            </Button>
        </div>
    );
}
