import { createFolder } from '@/lib/files-api';

export type FileWithDirectoryPath = {
    file: File;
    directoryPath: string;
};

type FileWithRelativePath = File & {
    webkitRelativePath?: string;
};

const MAX_CONCURRENT_UPLOADS = 3;

function directoryPathFromRelativePath(relativePath: string): string {
    if (!relativePath.includes('/')) {
        return '';
    }

    return relativePath.split('/').slice(0, -1).join('/');
}

async function readDirectoryEntries(
    reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
    const entries: FileSystemEntry[] = [];

    while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
        });

        if (batch.length === 0) {
            break;
        }

        entries.push(...batch);
    }

    return entries;
}

async function collectFilesFromEntry(
    entry: FileSystemEntry,
    directoryPath: string,
    collected: FileWithDirectoryPath[],
): Promise<void> {
    if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
            fileEntry.file(resolve, reject);
        });

        collected.push({ file, directoryPath });
        return;
    }

    if (!entry.isDirectory) {
        return;
    }

    const directoryEntry = entry as FileSystemDirectoryEntry;
    const nextDirectoryPath = directoryPath
        ? `${directoryPath}/${directoryEntry.name}`
        : directoryEntry.name;

    const reader = directoryEntry.createReader();
    const entries = await readDirectoryEntries(reader);

    for (const childEntry of entries) {
        await collectFilesFromEntry(childEntry, nextDirectoryPath, collected);
    }
}

export function hasDirectoryInDataTransferItems(
    items: DataTransferItemList,
): boolean {
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];

        if (!item || item.kind !== 'file') {
            continue;
        }

        const entry =
            item.webkitGetAsEntry?.() ??
            (
                item as DataTransferItem & {
                    getAsEntry?: () => FileSystemEntry | null;
                }
            ).getAsEntry?.();

        if (entry?.isDirectory) {
            return true;
        }
    }

    return false;
}

export async function collectFilesFromDataTransferItems(
    items: DataTransferItemList,
): Promise<FileWithDirectoryPath[]> {
    const collected: FileWithDirectoryPath[] = [];

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];

        if (!item || item.kind !== 'file') {
            continue;
        }

        const entry =
            item.webkitGetAsEntry?.() ??
            (
                item as DataTransferItem & {
                    getAsEntry?: () => FileSystemEntry | null;
                }
            ).getAsEntry?.();

        if (entry) {
            await collectFilesFromEntry(entry, '', collected);
            continue;
        }

        const file = item.getAsFile();

        if (file) {
            collected.push({ file, directoryPath: '' });
        }
    }

    return collected;
}

export function collectFilesFromFileList(
    files: FileList | File[],
): FileWithDirectoryPath[] {
    return Array.from(files).map((file) => {
        const relativePath =
            (file as FileWithRelativePath).webkitRelativePath ?? '';

        return {
            file,
            directoryPath: directoryPathFromRelativePath(relativePath),
        };
    });
}

export async function ensureFolderPath(
    directoryPath: string,
    rootParentId: number | null,
    folderIdByPath: Map<string, number>,
): Promise<number | null> {
    if (!directoryPath) {
        return rootParentId;
    }

    const cachedFolderId = folderIdByPath.get(directoryPath);

    if (cachedFolderId !== undefined) {
        return cachedFolderId;
    }

    const pathSegments = directoryPath.split('/');
    let currentPath = '';
    let parentId = rootParentId;

    for (const segment of pathSegments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;

        const cachedSegmentFolderId = folderIdByPath.get(currentPath);

        if (cachedSegmentFolderId !== undefined) {
            parentId = cachedSegmentFolderId;
            continue;
        }

        const folder = await createFolder(segment, parentId);
        folderIdByPath.set(currentPath, folder.id);
        parentId = folder.id;
    }

    return parentId;
}

export async function ensureAllFolderPaths(
    directoryPaths: string[],
    rootParentId: number | null,
): Promise<Map<string, number>> {
    const folderIdByPath = new Map<string, number>();
    const uniquePaths = [
        ...new Set(directoryPaths.filter((directoryPath) => directoryPath.length > 0)),
    ];

    uniquePaths.sort(
        (leftPath, rightPath) =>
            leftPath.split('/').length - rightPath.split('/').length,
    );

    for (const directoryPath of uniquePaths) {
        await ensureFolderPath(directoryPath, rootParentId, folderIdByPath);
    }

    return folderIdByPath;
}

export function inferFolderUploadLabel(
    filesToUpload: FileWithDirectoryPath[],
): string {
    const directoryPaths = filesToUpload
        .map((entry) => entry.directoryPath)
        .filter((directoryPath) => directoryPath.length > 0);

    if (directoryPaths.length === 0) {
        return `${filesToUpload.length} files`;
    }

    const rootFolderNames = new Set(
        directoryPaths.map((directoryPath) => directoryPath.split('/')[0]),
    );

    if (rootFolderNames.size === 1) {
        return [...rootFolderNames][0];
    }

    return `${filesToUpload.length} files`;
}

export async function runWithConcurrencyLimit(
    tasks: Array<() => Promise<void>>,
    limit: number = MAX_CONCURRENT_UPLOADS,
): Promise<void> {
    if (tasks.length === 0) {
        return;
    }

    const pendingTasks = [...tasks];
    const workerCount = Math.min(limit, pendingTasks.length);

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (pendingTasks.length > 0) {
                const task = pendingTasks.shift();

                if (task) {
                    await task();
                }
            }
        }),
    );
}
