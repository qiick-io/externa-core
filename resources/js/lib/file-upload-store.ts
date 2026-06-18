import type { FileUploadProgress } from '@/types/files';

type FileUploadListener = (uploads: FileUploadProgress[]) => void;

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

export function subscribeToFileUploads(
    listener: FileUploadListener,
): () => void {
    listeners.add(listener);
    listener([...uploads]);

    return () => {
        listeners.delete(listener);
    };
}

export function getFileUploads(): FileUploadProgress[] {
    return [...uploads];
}

export function addFileUpload(entry: FileUploadProgress): void {
    uploads = [...uploads, entry];
    notifyListeners();
}

export function updateFileUpload(
    uploadId: string,
    updater: (entry: FileUploadProgress) => FileUploadProgress,
): void {
    uploads = uploads.map((entry) =>
        entry.uploadId === uploadId ? updater(entry) : entry,
    );
    notifyListeners();
}

export function removeFileUpload(uploadId: string): void {
    uploads = uploads.filter((entry) => entry.uploadId !== uploadId);
    notifyListeners();
}

export function clearCompletedFileUploads(): void {
    uploads = uploads.filter((entry) => entry.status !== 'complete');
    notifyListeners();
}

export function dismissAllFileUploads(): void {
    uploads = [];
    notifyListeners();
}
