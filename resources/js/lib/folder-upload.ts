import { createFolder } from '@/lib/files-api';

/** A browser `File` paired with its relative directory path within an upload batch. */
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

/**
 * Reads all entries from a directory reader (handles batched `readEntries` calls).
 *
 * @param reader - Directory reader from a dropped folder entry
 * @returns Flat list of file system entries
 */
async function readDirectoryEntries(
    reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
    const entries: FileSystemEntry[] = [];

    while (true) {
        const batch = await new Promise<FileSystemEntry[]>(
            (resolve, reject) => {
                reader.readEntries(resolve, reject);
            },
        );

        if (batch.length === 0) {
            break;
        }

        entries.push(...batch);
    }

    return entries;
}

/**
 * Recursively collects files from a file system entry, preserving relative folder paths.
 *
 * @param entry - File or directory entry from drag-and-drop
 * @param directoryPath - Accumulated path prefix for nested folders
 * @param collected - Output array mutated with discovered files
 * @returns {void}
 */
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

/**
 * Detects whether a data transfer contains at least one directory entry.
 *
 * @param items - Items from a drag-and-drop or paste event
 * @returns `true` when a directory is present
 */
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

/**
 * Flattens drag-and-drop items into files with relative directory paths.
 * Falls back to plain files when the File System Access API entry is unavailable.
 *
 * @param items - Items from a drag-and-drop event
 * @returns Files with their relative directory paths
 */
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

/**
 * Maps a `FileList` or array to files with directory paths from `webkitRelativePath`.
 *
 * @param files - Files from an `<input webkitdirectory>` or similar
 * @returns Files with parsed relative directory paths
 */
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

/**
 * Ensures a nested folder path exists under a root parent, creating missing segments via the API.
 * Uses `folderIdByPath` as a memo to avoid duplicate folder creation.
 *
 * @param directoryPath - Slash-separated relative path (empty for root)
 * @param rootParentId - Parent folder id at the upload root
 * @param folderIdByPath - Cache of path → folder id mappings
 * @returns Folder id for the deepest segment, or `rootParentId` when path is empty
 */
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

/**
 * Creates all unique folder paths needed before a batch folder upload.
 *
 * @param directoryPaths - Relative paths collected from files to upload
 * @param rootParentId - Parent folder id at the upload root
 * @returns Map of path → folder id for every created segment
 */
export async function ensureAllFolderPaths(
    directoryPaths: string[],
    rootParentId: number | null,
): Promise<Map<string, number>> {
    const folderIdByPath = new Map<string, number>();
    const uniquePaths = [
        ...new Set(
            directoryPaths.filter((directoryPath) => directoryPath.length > 0),
        ),
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

/**
 * Builds a human-readable label for a folder upload batch.
 * Uses the single root folder name when all files share one top-level directory.
 *
 * @param filesToUpload - Files with relative directory paths
 * @returns Label such as a folder name or `"N files"`
 */
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

/**
 * Runs async tasks with a bounded concurrency pool.
 *
 * @param tasks - Functions that return promises when invoked
 * @param limit - Maximum simultaneous tasks (defaults to 3)
 * @returns {void}
 */
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
