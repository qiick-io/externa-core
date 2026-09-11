import {
    Braces,
    ClipboardPaste,
    Copy,
    Eraser,
    MoreVertical,
    Settings2,
    Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { copyTextToClipboard, readTextFromClipboard } from '@/lib/clipboard';
import {
    parseFieldRawValue,
    stringifyFieldRawValue,
} from '@/lib/item-field-raw-value';
import { toast } from '@/lib/toast';

export type ItemFieldLabelMenuProps = {
    /** Resolve the current live value (form / override / default). */
    getCurrentValue?: () => unknown;
    isDirty?: boolean;
    readonly?: boolean;
    canEditFieldSchema?: boolean;
    /** Layout groups: only Edit field (no raw/undo/clear). */
    schemaOnly?: boolean;
    menuAlign?: 'start' | 'end';
    onApplyValue?: (value: unknown) => void;
    onUndo?: () => void;
    onClear?: () => void;
    onEditField?: () => void;
};

/**
 * Directus-like caret menu on an item form field label.
 */
export function ItemFieldLabelMenu({
    getCurrentValue,
    isDirty = false,
    readonly = false,
    canEditFieldSchema = false,
    schemaOnly = false,
    menuAlign = 'start',
    onApplyValue,
    onUndo,
    onClear,
    onEditField,
}: ItemFieldLabelMenuProps) {
    const { t } = useTranslation();
    const [rawOpen, setRawOpen] = useState(false);
    const [rawText, setRawText] = useState('');
    const showEditField = Boolean(canEditFieldSchema && onEditField);

    if (schemaOnly && !showEditField) {
        return null;
    }

    const openRawEditor = (): void => {
        setRawText(stringifyFieldRawValue(getCurrentValue?.() ?? null));
        setRawOpen(true);
    };

    const applyRawEditor = (): void => {
        onApplyValue?.(parseFieldRawValue(rawText));
        setRawOpen(false);
    };

    const handleCopy = async (): Promise<void> => {
        const ok = await copyTextToClipboard(
            stringifyFieldRawValue(getCurrentValue?.() ?? null),
        );

        if (ok) {
            toast.success(t('collections.fieldMenu.copied'));
        } else {
            toast.error(t('collections.fieldMenu.copyFailed'));
        }
    };

    const handlePaste = async (): Promise<void> => {
        const text = await readTextFromClipboard();

        if (text === null) {
            toast.error(t('collections.fieldMenu.pasteFailed'));

            return;
        }

        onApplyValue?.(parseFieldRawValue(text));
        toast.success(t('collections.fieldMenu.pasted'));
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground"
                        aria-label={t('collections.fieldMenu.open')}
                    >
                        <MoreVertical className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={menuAlign} className="min-w-48">
                    {schemaOnly ? (
                        <DropdownMenuItem
                            onClick={onEditField}
                            className="gap-2"
                        >
                            <Settings2 className="size-3.5" />
                            {t('collections.fieldMenu.editField')}
                        </DropdownMenuItem>
                    ) : (
                        <>
                            <DropdownMenuItem
                                disabled={readonly}
                                onClick={openRawEditor}
                                className="gap-2"
                            >
                                <Braces className="size-3.5" />
                                {t('collections.fieldMenu.editRaw')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    void handleCopy();
                                }}
                                className="gap-2"
                            >
                                <Copy className="size-3.5" />
                                {t('collections.fieldMenu.copyRaw')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={readonly}
                                onClick={() => {
                                    void handlePaste();
                                }}
                                className="gap-2"
                            >
                                <ClipboardPaste className="size-3.5" />
                                {t('collections.fieldMenu.pasteRaw')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                disabled={readonly || !isDirty}
                                onClick={onUndo}
                                className="gap-2"
                            >
                                <Undo2 className="size-3.5" />
                                {t('collections.fieldMenu.undo')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={readonly}
                                onClick={onClear}
                                className="gap-2"
                            >
                                <Eraser className="size-3.5" />
                                {t('collections.fieldMenu.clear')}
                            </DropdownMenuItem>
                            {showEditField ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={onEditField}
                                        className="gap-2"
                                    >
                                        <Settings2 className="size-3.5" />
                                        {t('collections.fieldMenu.editField')}
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {schemaOnly ? null : (
                <Dialog open={rawOpen} onOpenChange={setRawOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {t('collections.fieldMenu.editRawTitle')}
                            </DialogTitle>
                            <DialogDescription>
                                {t('collections.fieldMenu.editRawDescription')}
                            </DialogDescription>
                        </DialogHeader>
                        <Textarea
                            value={rawText}
                            onChange={(event) => setRawText(event.target.value)}
                            className="min-h-48 font-mono text-xs"
                            spellCheck={false}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRawOpen(false)}
                            >
                                {t('collections.fieldMenu.cancel')}
                            </Button>
                            <Button type="button" onClick={applyRawEditor}>
                                {t('collections.fieldMenu.apply')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
