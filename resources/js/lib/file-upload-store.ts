import type { FileUploadProgress } from '@/types/files';

type FileUploadListener = (uploads: FileUploadProgress[]) => void;

/**
 * Generates a unique upload tracking id (`crypto.randomUUID` with a time-based fallback).
 *
 * @returns Upload id string
 */
export function createUploadId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID();
    }

    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

let uploads: FileUploadProgress[] = [];
const listeners = new Set<FileUploadListener>();

function notifyListeners(): void {
    const snapshot = [...uploads];
    listeners.forEach((listener) => listener(snapshot));
}

/**
 * Subscribes to in-flight file upload progress updates.
 * The listener is invoked immediately with the current snapshot.
 *
 * @param listener - Callback receiving the full upload list on each change
 * @returns Unsubscribe function
 */
export function subscribeToFileUploads(
    listener: FileUploadListener,
): () => void {
    listeners.add(listener);
    listener([...uploads]);

    return () => {
        listeners.delete(listener);
    };
}

/**
 * Returns a snapshot of all tracked uploads.
 *
 * @returns Copy of the current upload progress list
 */
export function getFileUploads(): FileUploadProgress[] {
    return [...uploads];
}

/**
 * Appends a new upload entry and notifies subscribers.
 *
 * @param entry - Upload progress record to track
 * @returns {void}
 */
export function addFileUpload(entry: FileUploadProgress): void {
    uploads = [...uploads, entry];
    notifyListeners();
}

/**
 * Updates a single upload entry by id.
 *
 * @param uploadId - Id of the upload to mutate
 * @param updater - Function returning the next entry state
 * @returns {void}
 */
export function updateFileUpload(
    uploadId: string,
    updater: (entry: FileUploadProgress) => FileUploadProgress,
): void {
    uploads = uploads.map((entry) =>
        entry.uploadId === uploadId ? updater(entry) : entry,
    );
    notifyListeners();
}

/**
 * Removes an upload entry from the store.
 *
 * @param uploadId - Id of the upload to remove
 * @returns {void}
 */
export function removeFileUpload(uploadId: string): void {
    uploads = uploads.filter((entry) => entry.uploadId !== uploadId);
    notifyListeners();
}

/**
 * Drops completed uploads while keeping pending, uploading, and errored entries.
 *
 * @returns {void}
 */
export function clearCompletedFileUploads(): void {
    uploads = uploads.filter((entry) => entry.status !== 'complete');
    notifyListeners();
}

/**
 * Clears all tracked uploads.
 *
 * @returns {void}
 */
export function dismissAllFileUploads(): void {
    uploads = [];
    notifyListeners();
}

// ponytail: browser QA injects pending uploads without a real multipart
if (import.meta.env.DEV) {
    (
        window as unknown as {
            __externaFileUploads?: {
                createUploadId: typeof createUploadId;
                addFileUpload: typeof addFileUpload;
                updateFileUpload: typeof updateFileUpload;
                removeFileUpload: typeof removeFileUpload;
                dismissAllFileUploads: typeof dismissAllFileUploads;
                getFileUploads: typeof getFileUploads;
            };
        }
    ).__externaFileUploads = {
        createUploadId,
        addFileUpload,
        updateFileUpload,
        removeFileUpload,
        dismissAllFileUploads,
        getFileUploads,
    };
}
