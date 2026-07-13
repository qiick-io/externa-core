import { FolderOpen, ImageIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import adminRoutes from '@/lib/admin-routes';
import {
    CHUNK_SIZE_BYTES,
    filePublicUrl,
    isImageFile,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileBreadcrumb } from '@/types/files';

type FilePickerDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (file: AdminFileRow) => void;
    acceptImagesOnly?: boolean;
    title?: string;
};

export function FilePickerDrawer({
    open,
    onOpenChange,
    onSelect,
    acceptImagesOnly = false,
    title = 'Choose file',
}: FilePickerDrawerProps) {
    const [parentId, setParentId] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<FileBreadcrumb[]>([]);
    const [files, setFiles] = useState<AdminFileRow[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (parentId !== null) {
                params.set('parent_id', String(parentId));
            }
            if (search.trim()) {
                params.set('search', search.trim());
            }

            const response = await fetch(
                `${adminRoutes.files.list()}?${params.toString()}`,
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                },
            );

            if (!response.ok) {
                return;
            }

            const payload = (await response.json()) as { data: AdminFileRow[] };
            setFiles(payload.data);
        } finally {
            setLoading(false);
        }
    }, [parentId, search]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = setTimeout(() => {
            void loadFiles();
        }, search ? 300 : 0);

        return () => clearTimeout(timer);
    }, [open, loadFiles, search]);

    useEffect(() => {
        if (!open) {
            setParentId(null);
            setBreadcrumbs([]);
            setSearch('');
        }
    }, [open]);

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

    const handleUpload = async (selectedFiles: FileList | File[]): Promise<void> => {
        const fileList = Array.from(selectedFiles);
        setUploading(true);

        try {
            for (const file of fileList) {
                if (acceptImagesOnly && !file.type.startsWith('image/')) {
                    continue;
                }

                if (file.size > CHUNK_SIZE_BYTES) {
                    await uploadFileChunked(file, parentId);
                } else {
                    await uploadFileDirect(file, parentId);
                }
            }

            await loadFiles();
        } finally {
            setUploading(false);
        }
    };

    const visibleFiles = acceptImagesOnly
        ? files.filter(
              (file) => file.type === 'folder' || isImageFile(file),
          )
        : files;

    return (
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent className="max-w-lg">
                <DrawerHeader>
                    <DrawerTitle>{title}</DrawerTitle>
                    <DrawerDescription>
                        Browse folders or upload a new file
                    </DrawerDescription>
                </DrawerHeader>

                <DrawerBody className="space-y-4">
                    <Input
                        placeholder="Search files…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />

                    <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
                        <button
                            type="button"
                            className="hover:text-foreground"
                            onClick={() => navigateTo(-1)}
                        >
                            Root
                        </button>
                        {breadcrumbs.map((crumb, index) => (
                            <span key={crumb.id} className="flex items-center gap-1">
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
                        onFilesSelected={(selected) => void handleUpload(selected)}
                    />

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {loading && (
                            <p className="text-muted-foreground col-span-full text-sm">
                                Loading…
                            </p>
                        )}
                        {!loading && visibleFiles.length === 0 && (
                            <p className="text-muted-foreground col-span-full text-sm">
                                No files in this folder
                            </p>
                        )}
                        {visibleFiles.map((file) => {
                            const publicUrl = filePublicUrl(file);
                            const isFolder = file.type === 'folder';

                            return (
                                <button
                                    key={file.id}
                                    type="button"
                                    className={cn(
                                        'hover:bg-muted/60 flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors',
                                        'border-sidebar-border/70',
                                    )}
                                    onClick={() => {
                                        if (isFolder) {
                                            openFolder(file);
                                            return;
                                        }

                                        onSelect(file);
                                        onOpenChange(false);
                                    }}
                                >
                                    {isFolder ? (
                                        <FolderOpen className="size-10 text-amber-500" />
                                    ) : publicUrl && isImageFile(file) ? (
                                        <img
                                            src={publicUrl}
                                            alt={file.name}
                                            className="size-10 rounded object-cover"
                                        />
                                    ) : (
                                        <ImageIcon className="text-muted-foreground size-10" />
                                    )}
                                    <span className="w-full truncate text-center text-xs font-medium">
                                        {file.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </DrawerBody>

                <DrawerFooter>
                    <DrawerClose asChild>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
