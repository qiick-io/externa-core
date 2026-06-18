import adminRoutes from '@/lib/admin-routes';
import { formRequestHeaders, jsonRequestHeaders } from '@/lib/csrf';
import type { AdminFileRow } from '@/types/files';

export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024;

export function filePublicUrl(file: AdminFileRow): string | null {
    if (!file.storage_path || file.type !== 'file') {
        return null;
    }

    return `/storage/assets/${file.storage_path}`;
}

export function isImageFile(file: AdminFileRow): boolean {
    return Boolean(file.mime_type?.startsWith('image/'));
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

export async function uploadFileChunked(
    file: File,
    parentId: number | null,
    onProgress?: (uploadedChunks: number, totalChunks: number) => void,
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

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', String(chunkIndex));
        formData.append('chunk', chunkBlob, `${file.name}.part${chunkIndex}`);

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

        if (!chunkResponse.ok) {
            throw new Error(
                await parseResponseError(
                    chunkResponse,
                    `Failed to upload chunk ${chunkIndex + 1}`,
                ),
            );
        }

        onProgress?.(chunkIndex + 1, totalChunks);
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
