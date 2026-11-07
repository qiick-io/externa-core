import { usePage } from '@inertiajs/react';
import { FolderOpen } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDropzone } from '@/components/admin/file-dropzone';
import { FileCard } from '@/components/admin/files/file-card';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
    CHUNK_SIZE_BYTES,
    isImageFile,
    listFilesPage,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import { STRING_LIMITS } from '@/lib/string-limits';
import type { AdminFileRow, FileBreadcrumb } from '@/types/files';

type FilePickerDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Always receives an array; single-pick mode passes one file then closes. */
    onSelect: (files: AdminFileRow[]) => void;
    acceptImagesOnly?: boolean;
    /** Toggle multi-select; confirm via footer instead of closing on first click. */
    multiple?: boolean;
    /** Drawer title; defaults to the translated "Choose file". */
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
    title,
}: FilePickerDrawerProps) {
    const { t } = useTranslation();
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
                    <DrawerTitle>
                        {title ?? t('files.picker.title')}
                    </DrawerTitle>
                    <DrawerDescription>
                        {multiple
                            ? t('files.picker.descriptionMultiple')
                            : t('files.picker.description')}
                    </DrawerDescription>
                </DrawerHeader>

                <DrawerBody className="space-y-4">
                    <Input
                        placeholder={t('files.toolbar.searchFiles')}
                        value={search}
                        maxLength={STRING_LIMITS.SEARCH}
                        onChange={(event) => setSearch(event.target.value)}
                    />

                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                {breadcrumbs.length === 0 ? (
                                    <BreadcrumbPage>
                                        {t('files.root')}
                                    </BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild>
                                        <button
                                            type="button"
                                            onClick={() => navigateTo(-1)}
                                        >
                                            {t('files.root')}
                                        </button>
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {breadcrumbs.map((crumb, index) => (
                                <Fragment key={crumb.id}>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        {index === breadcrumbs.length - 1 ? (
                                            <BreadcrumbPage>
                                                {crumb.name}
                                            </BreadcrumbPage>
                                        ) : (
                                            <BreadcrumbLink asChild>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        navigateTo(index)
                                                    }
                                                >
                                                    {crumb.name}
                                                </button>
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                </Fragment>
                            ))}
                        </BreadcrumbList>
                    </Breadcrumb>

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
                            <div className="col-span-full flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                                <Spinner className="size-5" />
                                {t('files.loading')}
                            </div>
                        )}
                        {!loading && visibleFiles.length === 0 && (
                            <Empty className="col-span-full gap-3 p-6 md:p-6">
                                <EmptyHeader>
                                    <EmptyMedia
                                        variant="icon"
                                        className="bg-primary/10 text-primary"
                                    >
                                        <FolderOpen />
                                    </EmptyMedia>
                                    <EmptyDescription>
                                        {t('files.picker.empty')}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                        {visibleFiles.map((file) => (
                            <FileCard
                                key={file.id}
                                file={file}
                                selected={
                                    multiple &&
                                    selected.some((row) => row.id === file.id)
                                }
                                multiSelectMode={multiple}
                                onSelect={() => {
                                    if (file.type === 'folder') {
                                        openFolder(file);

                                        return;
                                    }

                                    pickFile(file);
                                }}
                                onOpenFolder={() => openFolder(file)}
                            />
                        ))}
                    </div>

                    {hasMore && (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={loading || loadingMore}
                            onClick={() => void loadFiles(page + 1, true)}
                        >
                            {loadingMore && <Spinner />}
                            {t('files.loadMore')}
                        </Button>
                    )}
                </DrawerBody>

                <DrawerFooter>
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            {t('common.cancel')}
                        </Button>
                    </DrawerClose>
                    {multiple ? (
                        <Button
                            type="button"
                            disabled={selected.length === 0}
                            onClick={confirmSelection}
                        >
                            {selected.length === 0
                                ? t('files.picker.chooseFiles')
                                : t('files.picker.chooseCount', {
                                      count: selected.length,
                                  })}
                        </Button>
                    ) : null}
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
