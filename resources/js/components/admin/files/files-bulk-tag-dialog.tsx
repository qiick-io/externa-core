import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TagPicker } from '@/components/admin/files/tag-picker';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { bulkFileAction } from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { FileTag } from '@/types/files';

type FilesBulkTagDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tagCatalog: FileTag[];
    selectedIds: number[];
    onApplied: () => Promise<void>;
};

/**
 * Adds tags to every selected file in one bulk request. The picked tags are
 * cleared whenever the dialog closes; `onApplied` refreshes the catalog and list.
 */
export function FilesBulkTagDialog({
    open,
    onOpenChange,
    tagCatalog,
    selectedIds,
    onApplied,
}: FilesBulkTagDialogProps) {
    const { t } = useTranslation();
    const [bulkTags, setBulkTags] = useState<string[]>([]);

    const resetBulkTagDialog = (): void => {
        setBulkTags([]);
    };

    const applyBulkTags = async (): Promise<void> => {
        if (bulkTags.length === 0 || selectedIds.length === 0) {
            return;
        }

        try {
            await bulkFileAction('tag', selectedIds, {
                tags: bulkTags,
            });
            onOpenChange(false);
            resetBulkTagDialog();
            await onApplied();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.toasts.tagFailed'),
            );
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                onOpenChange(nextOpen);

                if (!nextOpen) {
                    resetBulkTagDialog();
                }
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('files.dialogs.addTagsTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        {t('files.dialogs.addTagsDescription')}
                    </p>
                    <TagPicker
                        value={bulkTags}
                        onChange={setBulkTags}
                        catalog={tagCatalog}
                    />
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        onClick={() => {
                            void applyBulkTags();
                        }}
                    >
                        {t('files.dialogs.applyTags')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
