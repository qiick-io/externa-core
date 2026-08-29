import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { importFileFromUrl, isImageFile } from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { AdminFileRow } from '@/types/files';

/**
 * Download a remote file into the library (Directus-style Import from URL).
 * Shared by file/image fields and markdown image toolbar.
 */
export function FileUrlImportDialog({
    open,
    onOpenChange,
    acceptImagesOnly,
    onImported,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    acceptImagesOnly: boolean;
    onImported: (file: AdminFileRow) => void;
}) {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) {
            setUrl('');
            setBusy(false);
        }
    }, [open]);

    const submit = async (): Promise<void> => {
        const trimmed = url.trim();

        if (trimmed === '' || busy) {
            return;
        }

        setBusy(true);

        try {
            const file = await importFileFromUrl(trimmed, null);

            if (acceptImagesOnly && !isImageFile(file)) {
                toast.error(t('collections.fileField.imageRequired'));

                return;
            }

            onImported(file);
            onOpenChange(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('collections.fileField.importFailed'),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.fileField.importFromUrl')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.fileField.importFromUrlDescription')}
                    </DialogDescription>
                </DialogHeader>
                <Input
                    type="url"
                    value={url}
                    placeholder="https://"
                    autoFocus
                    disabled={busy}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                />
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('collections.fileField.cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || url.trim() === ''}
                        onClick={() => void submit()}
                    >
                        {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {t('collections.fileField.import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
