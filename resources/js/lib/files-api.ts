import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import { formatFileSize } from '@/lib/format';
import { assertOk, parseError } from '@/lib/http';
import files from '@/routes/files';
import { index as fileTagsCatalogIndex } from '@/routes/files/tags';
import type { AdminFileRow, FileTag } from '@/types/files';

export { formatFileSize };

/** Size of each chunk for resumable large file uploads (10 MiB). */
export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
/** Maximum retry attempts per failed upload chunk. */
export const MAX_CHUNK_RETRIES = 3;
/** Base delay in milliseconds between chunk retry attempts (multiplied by attempt index). */
export const CHUNK_RETRY_BASE_DELAY_MS = 1000;

/**
 * Client-side gate against project Files upload cap (null = unlimited).
 *
 * @throws Error when file exceeds the configured cap
 */
export function assertWithinFilesUploadCap(
    fileSize: number,
    maxBytes: number | null | undefined,
): void {
    if (maxBytes == null) {
        return;
    }

    if (fileSize > maxBytes) {
        throw new Error(
            `File exceeds the ${formatFileSize(maxBytes)} upload limit.`,
        );
    }
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

/**
 * Resolves the public URL for a file row, preferring server-provided `url`.
 *
 * @param file - File manager row
 * @returns Public URL, or `null` for folders or files without storage
 */
export function filePublicUrl(file: AdminFileRow): string | null {
    if (file.url) {
        return file.url;
    }

    if (!file.storage_path || file.type !== 'file') {
        return null;
    }

    // Never invent a public /storage/assets URL for effective-private bytes.
    if (file.effective_access === 'private' || file.disk === 'private_assets') {
        return files.download.url(file.id);
    }

    return `/storage/assets/${file.storage_path}`;
}

/**
 * Is Image File.
 *
 * @param file - File manager row
 * @returns Whether the mime type indicates an image
 */
export function isImageFile(file: AdminFileRow): boolean {
    return Boolean(file.mime_type?.startsWith('image/'));
}

/**
 * Is Video File.
 *
 * @param file - File manager row
 * @returns Whether the mime type indicates a video
 */
export function isVideoFile(file: AdminFileRow): boolean {
    return Boolean(file.mime_type?.startsWith('video/'));
}

/**
 * Is Playable Video.
 *
 * @param file - File manager row
 * @returns Whether the browser can play this video inline (MP4 or WebM)
 */
export function isPlayableVideo(file: AdminFileRow): boolean {
    return file.mime_type === 'video/mp4' || file.mime_type === 'video/webm';
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

/**
 * Creates a folder under an optional parent via the file manager API.
 *
 * @param name - Folder name
 * @param parentId - Parent folder id, or null for root
 * @returns Created folder row
 */
export async function createFolder(
    name: string,
    parentId: number | null,
): Promise<AdminFileRow> {
    const response = await request(
        files.folders.store.url(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ name, parent_id: parentId }),
        },
        'Failed to create folder',
    );

    await assertOk(response, 'Failed to create folder');

    return (await response.json()) as AdminFileRow;
}

/**
 * Uploads a file in a single request (non-chunked).
 *
 * @param file - Browser file to upload
 * @param parentId - Destination folder id, or null for root
 * @returns Created file row
 */
export async function uploadFileDirect(
    file: File,
    parentId: number | null,
    maxBytes?: number | null,
): Promise<AdminFileRow> {
    assertWithinFilesUploadCap(file.size, maxBytes);

    const formData = new FormData();
    formData.append('file', file);

    if (parentId !== null) {
        formData.append('parent_id', String(parentId));
    }

    const response = await request(
        files.upload.url(),
        {
            method: 'POST',
            headers: formRequestHeaders(),
            credentials: 'same-origin',
            body: formData,
        },
        'Failed to upload file',
    );

    await assertOk(response, 'Failed to upload file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Downloads a remote URL server-side and stores it in the file manager root (or folder).
 *
 * @param url - Public http(s) URL of a file/image
 * @param parentId - Destination folder id, or null for root
 * @param name - Optional override filename
 * @returns Created file row
 */
export async function importFileFromUrl(
    url: string,
    parentId: number | null,
    name?: string,
): Promise<AdminFileRow> {
    const response = await request(
        files.importUrl.url(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({
                url,
                parent_id: parentId,
                ...(name ? { name } : {}),
            }),
        },
        'Failed to import file from URL',
    );

    await assertOk(response, 'Failed to import file from URL');

    return (await response.json()) as AdminFileRow;
}

/**
 * Moves a file or folder to a new parent.
 *
 * @param fileId - Id of the item to move
 * @param parentId - Destination folder id, or null for root
 * @returns Updated file row
 */
export async function moveFile(
    fileId: number,
    parentId: number | null,
): Promise<AdminFileRow> {
    const response = await fetch(files.move.url(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ parent_id: parentId }),
    });

    await assertOk(response, 'Failed to move file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Renames a file or folder.
 *
 * @param fileId - Id of the item to rename
 * @param name - New name
 * @returns Updated file row
 */
export async function renameFile(
    fileId: number,
    name: string,
): Promise<AdminFileRow> {
    const response = await fetch(files.rename.url(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ name }),
    });

    await assertOk(response, 'Failed to rename file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Soft-deletes a file or folder.
 *
 * @param fileId - Id of the item to delete
 * @returns {void}
 */
export async function deleteFile(fileId: number): Promise<void> {
    const response = await fetch(files.destroy.url(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to delete file');
}

export type FileWhereUsedReference = {
    collection_id: number;
    collection_name: string;
    collection_slug: string;
    item_id: number;
    field: string;
};

export type FileWhereUsedResponse = {
    file_id: number;
    count: number;
    references: FileWhereUsedReference[];
};

/**
 * Scan collection items that reference a file (on-demand).
 */
export async function fetchFileWhereUsed(
    fileId: number,
): Promise<FileWhereUsedResponse> {
    const response = await fetch(files.whereUsed.url(fileId), {
        method: 'GET',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to scan file references');

    return (await response.json()) as FileWhereUsedResponse;
}

/**
 * Restores a soft-deleted file or folder.
 *
 * @param fileId - Id of the trashed item
 * @returns Restored file row
 */
export async function restoreFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(files.restore.url(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to restore file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Permanently deletes a trashed file or folder.
 *
 * @param fileId - Id of the trashed item
 * @returns {void}
 */
export async function forceDeleteFile(fileId: number): Promise<void> {
    const response = await fetch(files.forceDelete.url(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to permanently delete file');
}

/**
 * Updates editable metadata fields on a file row.
 *
 * @param fileId - Id of the file to update
 * @param payload - Partial metadata fields to persist
 * @returns Updated file row
 */
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
        access: 'public' | 'private' | null;
    }>,
): Promise<AdminFileRow> {
    const response = await fetch(files.update.url(fileId), {
        method: 'PATCH',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });

    await assertOk(response, 'Failed to update file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Replaces file binary content while keeping the same file row id.
 *
 * @param fileId - Id of the file to replace
 * @param file - New file content
 * @returns Updated file row
 */
export async function replaceFile(
    fileId: number,
    file: File,
): Promise<AdminFileRow> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await request(
        files.replace.url(fileId),
        {
            method: 'POST',
            headers: formRequestHeaders(),
            credentials: 'same-origin',
            body: formData,
        },
        'Failed to replace file',
    );

    await assertOk(response, 'Failed to replace file');

    return (await response.json()) as AdminFileRow;
}

/** Result of a duplicate/copy request — immediate row or queued background job. */
export type DuplicateFileResult =
    { queued: false; file: AdminFileRow } | { queued: true; job_id: string };

/**
 * Duplicates a file or folder, optionally under a different parent.
 * Large copies may return HTTP 202 with a background job id.
 *
 * @param fileId - Source file or folder id
 * @param parentId - Destination parent id (defaults to same parent)
 * @returns Immediate file row or queued job handle
 */
export async function copyFile(
    fileId: number,
    parentId?: number | null,
): Promise<DuplicateFileResult> {
    const response = await fetch(files.copy.url(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ parent_id: parentId ?? null }),
    });

    await assertOk(response, 'Failed to duplicate file');

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

/**
 * Marks a file as favorited for the current user.
 *
 * @param fileId - File id
 * @returns Updated file row
 */
export async function favoriteFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(files.favorite.url(fileId), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to favorite file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Removes the favorite flag from a file.
 *
 * @param fileId - File id
 * @returns Updated file row
 */
export async function unfavoriteFile(fileId: number): Promise<AdminFileRow> {
    const response = await fetch(files.unfavorite.url(fileId), {
        method: 'DELETE',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to unfavorite file');

    return (await response.json()) as AdminFileRow;
}

/**
 * Replaces the tag list on a file.
 *
 * @param fileId - File id
 * @param tags - Tag names to attach
 * @returns Updated file row
 */
export async function syncFileTags(
    fileId: number,
    tags: string[],
): Promise<AdminFileRow> {
    const response = await fetch(files.tags.url(fileId), {
        method: 'PUT',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ tags }),
    });

    await assertOk(response, 'Failed to update tags');

    return (await response.json()) as AdminFileRow;
}

/**
 * Loads the global tag catalog for the file manager.
 *
 * @returns All known tags
 */
export async function listFileTagsCatalog(): Promise<FileTag[]> {
    const response = await fetch(fileTagsCatalogIndex.url(), {
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
    });

    await assertOk(response, 'Failed to load tags');

    return (await response.json()) as FileTag[];
}

/**
 * Download File Url.
 *
 * @param fileId - File id
 * @returns Download URL for a single file
 */
export function downloadFileUrl(fileId: number): string {
    return files.download.url(fileId);
}

/**
 * Download Prepared Zip Url.
 *
 * @param jobId - Background zip preparation job id
 * @returns Download URL for a prepared zip archive
 */
export function downloadPreparedZipUrl(jobId: string): string {
    return files.zips.download.url(jobId);
}

/** Handle returned when a multi-file zip download is queued asynchronously. */
export type QueueZipDownloadResult = { queued: true; job_id: string };

/**
 * Queues a background job to zip and download multiple files.
 *
 * @param fileIds - Ids of files and folders to include
 * @returns Job handle for polling and download
 */
export async function queueFilesZipDownload(
    fileIds: number[],
): Promise<QueueZipDownloadResult> {
    const response = await fetch(files.downloadMany.url(), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ ids: fileIds }),
    });

    await assertOk(response, 'Failed to prepare zip download');

    const payload = (await response.json()) as {
        queued: true;
        job_id: string;
    };

    return { queued: true, job_id: payload.job_id };
}

/** Result of a bulk file action — immediate completion or queued job. */
export type BulkFileActionResult =
    { queued: false } | { queued: true; job_id: string };

/**
 * Runs a bulk action (move, delete, restore, etc.) on multiple file ids.
 *
 * @param action - Server-recognized bulk action name
 * @param ids - Target file/folder ids
 * @param extra - Additional payload fields for the action
 * @returns Whether the action completed immediately or was queued
 */
export async function bulkFileAction(
    action: string,
    ids: number[],
    extra: Record<string, unknown> = {},
): Promise<BulkFileActionResult> {
    const response = await fetch(files.bulk.url(), {
        method: 'POST',
        headers: jsonRequestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ action, ids, ...extra }),
    });

    await assertOk(response, 'Failed to run bulk action');

    if (response.status === 202) {
        const payload = (await response.json()) as {
            queued: true;
            job_id: string;
        };

        return { queued: true, job_id: payload.job_id };
    }

    return { queued: false };
}

/**
 * Fetches a paginated file listing for a folder with optional filters.
 *
 * @param options - Folder, trash mode, pagination, search, tags, and sort options
 * @returns Paginated file rows
 */
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
        files.list.url({
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

    await assertOk(response, 'Failed to load files');

    return (await response.json()) as {
        data: AdminFileRow[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

/**
 * Resolve file manager rows by id (for field input previews).
 *
 * @param ids - File ids to load
 * @returns Matching rows in the same order as `ids` (missing ids omitted)
 */
export async function fetchFilesByIds(ids: number[]): Promise<AdminFileRow[]> {
    const uniqueIds = [...new Set(ids.filter((id) => id > 0))];

    if (uniqueIds.length === 0) {
        return [];
    }

    const response = await fetch(
        files.list.url({
            query: { ids: uniqueIds },
        }),
        {
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
        },
    );

    await assertOk(response, 'Failed to load files');

    const payload = (await response.json()) as { data: AdminFileRow[] };
    const byId = new Map(payload.data.map((file) => [file.id, file]));

    return uniqueIds
        .map((id) => byId.get(id))
        .filter((file): file is AdminFileRow => file !== undefined);
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
                files.uploads.chunk.url(),
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
                await parseError(
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

/**
 * Uploads a large file in fixed-size chunks with per-chunk retries.
 *
 * @param file - File to upload
 * @param parentId - Destination folder id, or null for root
 * @param onProgress - Optional callback after each chunk completes
 * @returns Created file row after assembly completes
 */
export async function uploadFileChunked(
    file: File,
    parentId: number | null,
    onProgress?: (
        uploadedChunks: number,
        totalChunks: number,
        uploadedBytes: number,
        totalBytes: number,
    ) => void,
    maxBytes?: number | null,
): Promise<AdminFileRow> {
    assertWithinFilesUploadCap(file.size, maxBytes);

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

    const initResponse = await request(
        files.uploads.init.url(),
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

    await assertOk(initResponse, 'Failed to initialize upload');

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
        files.uploads.complete.url(),
        {
            method: 'POST',
            headers: jsonRequestHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ upload_id: uploadId }),
        },
        'Failed to complete upload',
    );

    await assertOk(completeResponse, 'Failed to complete upload');

    return (await completeResponse.json()) as AdminFileRow;
}
