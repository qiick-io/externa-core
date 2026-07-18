import adminRoutes from '@/lib/admin-routes';
import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import type { AdminFileRow, FileTag } from '@/types/files';

export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CHUNK_RETRIES = 3;
export const CHUNK_RETRY_BASE_DELAY_MS = 1000;

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

export function filePublicUrl(file: AdminFileRow): string | null {
    if (file.url) {
        return file.url;
    }

    if (!file.storage_path || file.type !== 'file') {
        return null;
    }

    return `/storage/assets/${file.storage_path}`;
}

export function isImageFile(file: AdminFileRow): boolean {
    return Boolean(file.mime_type?.startsWith('image/'));
}

export function isVideoFile(file: AdminFileRow): boolean {
    return Boolean(file.mime_type?.startsWith('video/'));
}

export function isPlayableVideo(file: AdminFileRow): boolean {
    return file.mime_type === 'video/mp4' || file.mime_type === 'video/webm';
}

export function formatFileSize(bytes: number | null): string {
    if (bytes === null || bytes === 0) {
        return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function parseResponseError(
    response: Response,
    fallbackMessage: string,
): Promise<string> {
    try {
        const payload = (await response.json()) as {
            message?: string;
            errors?: Record<string, string[]>;
        };

        if (payload.errors) {
            const firstError = Object.values(payload.errors)[0]?.[0];

            if (firstError) {
                return firstError;
            }
        }

        if (payload.message) {
            return payload.message;
        }
    } catch {
        // Ignore JSON parse failures.
    }

    return fallbackMessage;
}

async function assertOkResponse(
    response: Response,
    fallbackMessage: string,
): Promise<void> {
    if (!response.ok) {
        throw new Error(await parseResponseError(response, fallbackMessage));
    }
}

async function request(
    input: RequestInfo | URL,
    init: RequestInit,
    fallbackMessage: string,
): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(
                `${fallbackMessage}: network error — too many simultaneous uploads can cause this; retrying one file at a time usually works`,
            );
        }

        throw error;
    }
}

export async function createFolder(
    name: string,
    parentId: number | null,
): Promise<AdminFileRow> {
    const response = await request(
        adminRoutes.files.createFolder(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ name, parent_id: parentId }),
        },
        'Failed to create folder',
    );

    await assertOkResponse(response, 'Failed to create folder');

    return (await response.json()) as AdminFileRow;
}

export async function uploadFileDirect(
    file: File,
    parentId: number | null,
): Promise<AdminFileRow> {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId !== null) {
        formData.append('parent_id', String(parentId));
    }

    const response = await request(
        adminRoutes.files.upload(),
        {
            method: 'POST',
            headers: formRequestHeaders(),
            credentials: 'same-origin',
            body: formData,
        },
        'Failed to upload file',
    );

    await assertOkResponse(response, 'Failed to upload file');

    return (await response.json()) as AdminFileRow;
}

export async function moveFile(
    fileId: number,
    parentId: number | null,
): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.move(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ parent_id: parentId }),
    });

    await assertOkResponse(response, 'Failed to move file');

    return (await response.json()) as AdminFileRow;
}

export async function renameFile(
    fileId: number,
    name: string,
): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.rename(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ name }),
    });

    await assertOkResponse(response, 'Failed to rename file');

    return (await response.json()) as AdminFileRow;
}

export async function deleteFile(fileId: number): Promise<void> {
    const response = await fetch(adminRoutes.files.destroy(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to delete file');
}

export async function restoreFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.restore(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to restore file');

    return (await response.json()) as AdminFileRow;
}

export async function forceDeleteFile(fileId: number): Promise<void> {
    const response = await fetch(adminRoutes.files.forceDelete(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to permanently delete file');
}

export async function updateFileMetadata(
    fileId: number,
    payload: Partial<{
        title: string | null;
        description: string | null;
        location: string | null;
        download_name: string | null;
        focal_point_x: number | null;
        focal_point_y: number | null;
        translate_x: number | null;
        translate_y: number | null;
        scale: number | null;
    }>,
): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.update(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    await assertOkResponse(response, 'Failed to update file');

    return (await response.json()) as AdminFileRow;
}

export async function replaceFile(
    fileId: number,
    file: File,
): Promise<AdminFileRow> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await request(
        adminRoutes.files.replace(fileId),
        {
            method: 'POST',
            headers: formRequestHeaders(),
            credentials: 'same-origin',
            body: formData,
        },
        'Failed to replace file',
    );

    await assertOkResponse(response, 'Failed to replace file');

    return (await response.json()) as AdminFileRow;
}

export type DuplicateFileResult =
    | { queued: false; file: AdminFileRow }
    | { queued: true; job_id: string };

export async function copyFile(
    fileId: number,
    parentId?: number | null,
): Promise<DuplicateFileResult> {
    const response = await fetch(adminRoutes.files.copy(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ parent_id: parentId ?? null }),
    });

    await assertOkResponse(response, 'Failed to duplicate file');

    if (response.status === 202) {
        const payload = (await response.json()) as {
            queued: true;
            job_id: string;
        };

        return { queued: true, job_id: payload.job_id };
    }

    return {
        queued: false,
        file: (await response.json()) as AdminFileRow,
    };
}

export async function favoriteFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.favorite(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to favorite file');

    return (await response.json()) as AdminFileRow;
}

export async function unfavoriteFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.favorite(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to unfavorite file');

    return (await response.json()) as AdminFileRow;
}

export async function syncFileTags(
    fileId: number,
    tags: string[],
): Promise<AdminFileRow> {
    const response = await fetch(adminRoutes.files.tags(fileId), {
        method: 'PUT',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ tags }),
    });

    await assertOkResponse(response, 'Failed to update tags');

    return (await response.json()) as AdminFileRow;
}

export async function listFileTagsCatalog(): Promise<FileTag[]> {
    const response = await fetch(adminRoutes.files.tagsCatalog(), {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOkResponse(response, 'Failed to load tags');

    return (await response.json()) as FileTag[];
}

export function downloadFileUrl(fileId: number): string {
    return adminRoutes.files.download(fileId);
}

export function downloadPreparedZipUrl(jobId: string): string {
    return adminRoutes.files.downloadZip(jobId);
}

export type QueueZipDownloadResult = { queued: true; job_id: string };

export async function queueFilesZipDownload(
    fileIds: number[],
): Promise<QueueZipDownloadResult> {
    const response = await fetch(adminRoutes.files.downloadMany(), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ ids: fileIds }),
    });

    await assertOkResponse(response, 'Failed to prepare zip download');

    const payload = (await response.json()) as {
        queued: true;
        job_id: string;
    };

    return { queued: true, job_id: payload.job_id };
}

export type BulkFileActionResult =
    | { queued: false }
    | { queued: true; job_id: string };

export async function bulkFileAction(
    action: string,
    ids: number[],
    extra: Record<string, unknown> = {},
): Promise<BulkFileActionResult> {
    const response = await fetch(adminRoutes.files.bulk(), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ action, ids, ...extra }),
    });

    await assertOkResponse(response, 'Failed to run bulk action');

    if (response.status === 202) {
        const payload = (await response.json()) as {
            queued: true;
            job_id: string;
        };

        return { queued: true, job_id: payload.job_id };
    }

    return { queued: false };
}

export async function listFilesPage(options: {
    parentId: number | null;
    trashed?: 'only' | 'with' | null;
    page: number;
    search?: string;
    tagIds?: number[];
    sort?: string;
    direction?: 'asc' | 'desc';
}): Promise<{
    data: AdminFileRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}> {
    const response = await fetch(
        adminRoutes.files.list({
            query: {
                parent_id: options.parentId ?? undefined,
                trashed: options.trashed ?? undefined,
                page: options.page,
                search: options.search || undefined,
                sort: options.sort || undefined,
                direction: options.direction || undefined,
                tag_ids:
                    options.tagIds && options.tagIds.length > 0
                        ? options.tagIds
                        : undefined,
            },
        }),
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOkResponse(response, 'Failed to load files');

    return (await response.json()) as {
        data: AdminFileRow[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

async function uploadChunkWithRetry(
    uploadId: string,
    chunkIndex: number,
    chunkBlob: Blob,
    fileName: string,
): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', String(chunkIndex));
        formData.append('chunk', chunkBlob, `${fileName}.part${chunkIndex}`);

        try {
            const chunkResponse = await request(
                adminRoutes.files.uploadsChunk(),
                {
                    method: 'POST',
                    headers: formRequestHeaders(),
                    credentials: 'same-origin',
                    body: formData,
                },
                `Failed to upload chunk ${chunkIndex + 1}`,
            );

            if (chunkResponse.ok) {
                return;
            }

            lastError = new Error(
                await parseResponseError(
                    chunkResponse,
                    `Failed to upload chunk ${chunkIndex + 1}`,
                ),
            );
        } catch (error) {
            lastError =
                error instanceof Error
                    ? error
                    : new Error(`Failed to upload chunk ${chunkIndex + 1}`);
        }

        if (attempt < MAX_CHUNK_RETRIES) {
            await sleep(CHUNK_RETRY_BASE_DELAY_MS * (attempt + 1));
        }
    }

    throw (
        lastError ??
        new Error(`Failed to upload chunk ${chunkIndex + 1} after retries`)
    );
}

export async function uploadFileChunked(
    file: File,
    parentId: number | null,
    onProgress?: (
        uploadedChunks: number,
        totalChunks: number,
        uploadedBytes: number,
        totalBytes: number,
    ) => void,
): Promise<AdminFileRow> {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

    const initResponse = await request(
        adminRoutes.files.uploadsInit(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({
                file_name: file.name,
                total_size: file.size,
                total_chunks: totalChunks,
                mime_type: file.type || null,
                parent_id: parentId,
            }),
        },
        'Failed to initialize upload',
    );

    await assertOkResponse(initResponse, 'Failed to initialize upload');

    const { upload_id: uploadId } = (await initResponse.json()) as {
        upload_id: string;
    };

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
        const chunkBlob = file.slice(start, end);

        await uploadChunkWithRetry(uploadId, chunkIndex, chunkBlob, file.name);

        onProgress?.(chunkIndex + 1, totalChunks, end, file.size);
    }

    const completeResponse = await request(
        adminRoutes.files.uploadsComplete(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ upload_id: uploadId }),
        },
        'Failed to complete upload',
    );

    await assertOkResponse(completeResponse, 'Failed to complete upload');

    return (await completeResponse.json()) as AdminFileRow;
}
