import { useEffect, useState } from 'react';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
    getFileUploads,
    subscribeToFileUploads,
} from '@/lib/file-upload-store';
import type { UnsavedChangesDialogCopy } from '@/lib/unsaved-changes/registry';

const UPLOAD_DIALOG_COPY: UnsavedChangesDialogCopy = {
    titleKey: 'unsavedChanges.uploadTitle',
    descriptionKey: 'unsavedChanges.uploadDescription',
    discardKey: 'unsavedChanges.uploadLeave',
};

function hasActiveUploads(): boolean {
    return getFileUploads().some(
        (upload) =>
            upload.status === 'pending' || upload.status === 'uploading',
    );
}

/**
 * Leave-guard while file uploads are pending/uploading.
 * Discard only allows leave — uploads keep running in the global store.
 */
export function useRegisterActiveUploads(): void {
    const [active, setActive] = useState(hasActiveUploads);

    useEffect(() => {
        return subscribeToFileUploads((uploads) => {
            setActive(
                uploads.some(
                    (upload) =>
                        upload.status === 'pending' ||
                        upload.status === 'uploading',
                ),
            );
        });
    }, []);

    useRegisterUnsavedChanges({
        scope: 'page',
        isDirty: active,
        // ponytail: leave anyway — store finishes uploads in background
        onDiscard: () => undefined,
        dialogCopy: UPLOAD_DIALOG_COPY,
    });
}
