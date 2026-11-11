import { useId, useState } from 'react';
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
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { importFileFromUrl, isImageFile } from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

/**
 * Download a remote file into the library (Import from URL).
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
    /** Why the URL could not be imported, under the field (app-ui `docs/notifications.md`). */
    const [urlError, setUrlError] = useState<string | null>(null);
    const urlErrorId = useId();

    const [wasOpen, setWasOpen] = useState(open);

    // Reset during render when the dialog closes (React's "adjust state on prop change" pattern).
    if (wasOpen !== open) {
        setWasOpen(open);

        if (!open) {
            setUrl('');
            setBusy(false);
            setUrlError(null);
        }
    }

    const submit = async (): Promise<void> => {
        const trimmed = url.trim();

        if (trimmed === '' || busy) {
            return;
        }

        setBusy(true);

        try {
            const file = await importFileFromUrl(trimmed, null);

            if (acceptImagesOnly && !isImageFile(file)) {
                setUrlError(t('collections.fileField.imageRequired'));

                return;
            }

            onImported(file);
            onOpenChange(false);
        } catch (error) {
            setUrlError(
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
                    aria-label={t('collections.fileField.importFromUrl')}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                    autoFocus
                    disabled={busy}
                    aria-invalid={urlError !== null}
                    aria-describedby={
                        urlError !== null ? urlErrorId : undefined
                    }
                    onChange={(event) => {
                        setUrl(event.target.value);
                        setUrlError(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                />
                <FieldError id={urlErrorId}>{urlError}</FieldError>
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
                        {busy ? <Spinner /> : null}
                        {t('collections.fileField.import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
