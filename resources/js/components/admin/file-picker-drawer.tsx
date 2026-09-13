import { usePage } from '@inertiajs/react';
import { Check, FolderOpen, ImageIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDropzone } from '@/components/admin/file-dropzone';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerBody,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
    CHUNK_SIZE_BYTES,
    filePublicUrl,
    isImageFile,
    listFilesPage,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import { STRING_LIMITS } from '@/lib/string-limits';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileBreadcrumb } from '@/types/files';

type FilePickerDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Always receives an array; single-pick mode passes one file then closes. */
    onSelect: (files: AdminFileRow[]) => void;
    acceptImagesOnly?: boolean;
    /** Toggle multi-select; confirm via footer instead of closing on first click. */
    multiple?: boolean;
    title?: string;
};

/**
 * Drawer for browsing and selecting existing files.
 */
export function FilePickerDrawer({
    open,
    onOpenChange,
    onSelect,
    acceptImagesOnly = false,
    multiple = false,
    title = 'Choose file',
}: FilePickerDrawerProps) {
    const { projectSettings } = usePage().props;
    const filesMaxUploadBytes = projectSettings?.filesMaxUploadBytes ?? null;
    const [parentId, setParentId] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<FileBreadcrumb[]>([]);
    const [files, setFiles] = useState<AdminFileRow[]>([]);
    const [selected, setSelected] = useState<AdminFileRow[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [uploading, setUploading] = useState(false);
    const openRef = useRef(open);
    openRef.current = open;
    // ponytail: drop stale list responses after close / folder change (no AbortController on list yet).
    const loadSeq = useRef(0);

    const loadFiles = useCallback(
        async (pageToLoad = 1, append = false): Promise<void> => {
            const seq = ++loadSeq.current;

            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            try {
                const payload = await listFilesPage({
                    parentId,
                    page: pageToLoad,
                    search: search.trim() || undefined,
                });

                if (seq !== loadSeq.current || !openRef.current) {
                    return;
                }

                setFiles((current) => {
                    if (!append) {
                        return payload.data;
                    }

                    const seenIds = new Set(current.map((file) => file.id));
                    const appended = payload.data.filter(
                        (file) => !seenIds.has(file.id),
                    );

                    return appended.length === 0
                        ? current
                        : [...current, ...appended];
                });
                setPage(payload.current_page);
                setLastPage(payload.last_page);
            } catch {
                if (seq === loadSeq.current && openRef.current && !append) {
                    setFiles([]);
                }
            } finally {
                if (seq === loadSeq.current) {
                    if (append) {
                        setLoadingMore(false);
                    } else {
                        setLoading(false);
                    }
                }
            }
        },
        [parentId, search],
    );

    useEffect(() => {
        if (!open) {
            setParentId(null);
            setBreadcrumbs([]);
            setSearch('');
            setPage(1);
            setLastPage(1);
            setFiles([]);
            setSelected([]);

            return;
        }

        let cancelled = false;
        const timer = setTimeout(
            () => {
                if (cancelled) {
                    return;
                }

                void loadFiles(1, false);
            },
            search ? 300 : 0,
        );

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [open, loadFiles, search]);

    const openFolder = (folder: AdminFileRow): void => {
        setParentId(folder.id);
        setBreadcrumbs((previous) => [
            ...previous,
            { id: folder.id, name: folder.name },
        ]);
    };

    const navigateTo = (index: number): void => {
        if (index < 0) {
            setParentId(null);
            setBreadcrumbs([]);

            return;
        }

        const target = breadcrumbs[index];
        setParentId(target.id);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    };

    const toggleSelected = (file: AdminFileRow): void => {
        setSelected((current) => {
            if (current.some((row) => row.id === file.id)) {
                return current.filter((row) => row.id !== file.id);
            }

            return [...current, file];
        });
    };

    const confirmSelection = (): void => {
        if (selected.length === 0) {
            return;
        }

        onSelect(selected);
        onOpenChange(false);
    };

    const pickFile = (file: AdminFileRow): void => {
        if (multiple) {
            toggleSelected(file);

            return;
        }

        onSelect([file]);
        onOpenChange(false);
    };

    const handleUpload = async (
        selectedFiles: FileList | File[],
    ): Promise<void> => {
        const fileList = Array.from(selectedFiles);
        setUploading(true);

        try {
            for (const file of fileList) {
                if (acceptImagesOnly && !file.type.startsWith('image/')) {
                    continue;
                }

                if (file.size > CHUNK_SIZE_BYTES) {
                    await uploadFileChunked(
                        file,
                        parentId,
                        undefined,
                        filesMaxUploadBytes,
                    );
                } else {
                    await uploadFileDirect(file, parentId, filesMaxUploadBytes);
                }
            }

            await loadFiles(1, false);
        } finally {
            setUploading(false);
        }
    };

    const visibleFiles = acceptImagesOnly
        ? files.filter((file) => file.type === 'folder' || isImageFile(file))
        : files;

    const hasMore = page < lastPage;

    return (
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent className="max-w-lg">
                <DrawerHeader>
                    <DrawerTitle>{title}</DrawerTitle>
                    <DrawerDescription>
                        {multiple
                            ? 'Click files to select them, then confirm below'
                            : 'Browse folders or upload a new file'}
                    </DrawerDescription>
                </DrawerHeader>

                <DrawerBody className="space-y-4">
                    <Input
                        placeholder="Search files…"
                        value={search}
                        maxLength={STRING_LIMITS.SEARCH}
                        onChange={(event) => setSearch(event.target.value)}
                    />

                    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                        <button
                            type="button"
                            className="hover:text-foreground"
                            onClick={() => navigateTo(-1)}
                        >
                            Root
                        </button>
                        {breadcrumbs.map((crumb, index) => (
                            <span
                                key={crumb.id}
                                className="flex items-center gap-1"
                            >
                                <span>/</span>
                                <button
                                    type="button"
                                    className="hover:text-foreground"
                                    onClick={() => navigateTo(index)}
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        ))}
                    </nav>

                    <FileDropzone
                        compact
                        showInlineEmptyState
                        disabled={uploading}
                        onFilesSelected={(selected) =>
                            void handleUpload(selected)
                        }
                    />

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {loading && (
                            <p className="col-span-full text-sm text-muted-foreground">
                                Loading…
                            </p>
                        )}
                        {!loading && visibleFiles.length === 0 && (
                            <p className="col-span-full text-sm text-muted-foreground">
                                No files in this folder
                            </p>
                        )}
                        {visibleFiles.map((file) => {
                            const publicUrl = filePublicUrl(file);
                            const isFolder = file.type === 'folder';
                            const isSelected =
                                multiple &&
                                selected.some((row) => row.id === file.id);

                            return (
                                <button
                                    key={file.id}
                                    type="button"
                                    aria-pressed={
                                        multiple && !isFolder
                                            ? isSelected
                                            : undefined
                                    }
                                    className={cn(
                                        'relative flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
                                        isSelected
                                            ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                                            : 'border-sidebar-border/70',
                                    )}
                                    onClick={() => {
                                        if (isFolder) {
                                            openFolder(file);

                                            return;
                                        }

                                        pickFile(file);
                                    }}
                                >
                                    {isSelected ? (
                                        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                            <Check
                                                className="size-3"
                                                aria-hidden
                                            />
                                        </span>
                                    ) : null}
                                    {isFolder ? (
                                        <FolderOpen className="size-10 text-amber-500" />
                                    ) : publicUrl && isImageFile(file) ? (
                                        <img
                                            src={publicUrl}
                                            alt={file.name}
                                            className="size-10 rounded object-cover"
                                        />
                                    ) : (
                                        <ImageIcon className="size-10 text-muted-foreground" />
                                    )}
                                    <span className="w-full truncate text-center text-xs font-medium">
                                        {file.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {hasMore && (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={loading || loadingMore}
                            onClick={() => void loadFiles(page + 1, true)}
                        >
                            {loadingMore ? 'Loading…' : 'Load more'}
                        </Button>
                    )}
                </DrawerBody>

                <DrawerFooter>
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </DrawerClose>
                    {multiple ? (
                        <Button
                            type="button"
                            disabled={selected.length === 0}
                            onClick={confirmSelection}
                        >
                            {selected.length === 0
                                ? 'Choose files'
                                : `Choose ${selected.length}`}
                        </Button>
                    ) : null}
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
