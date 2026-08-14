import { FolderOpen, Link2, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { FilePreview } from '@/components/admin/files/file-preview';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    CHUNK_SIZE_BYTES,
    importFileFromUrl,
    isImageFile,
    uploadFileChunked,
    uploadFileDirect,
    fetchFilesByIds,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';

async function uploadToFilesRoot(
    file: File,
    acceptImagesOnly: boolean,
): Promise<AdminFileRow | null> {
    if (acceptImagesOnly && !file.type.startsWith('image/')) {
        return null;
    }

    if (file.size > CHUNK_SIZE_BYTES) {
        return uploadFileChunked(file, null);
    }

    return uploadFileDirect(file, null);
}

function UrlImportDialog({
    open,
    onOpenChange,
    acceptImagesOnly,
    onImported,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    acceptImagesOnly: boolean;
    onImported: (file: AdminFileRow) => void;
}) {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) {
            setUrl('');
            setBusy(false);
        }
    }, [open]);

    const submit = async (): Promise<void> => {
        const trimmed = url.trim();

        if (trimmed === '' || busy) {
            return;
        }

        setBusy(true);

        try {
            const file = await importFileFromUrl(trimmed, null);

            if (acceptImagesOnly && !isImageFile(file)) {
                toast.error(t('collections.fileField.imageRequired'));

                return;
            }

            onImported(file);
            onOpenChange(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('collections.fileField.importFailed'),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.fileField.importFromUrl')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.fileField.importFromUrlDescription')}
                    </DialogDescription>
                </DialogHeader>
                <Input
                    type="url"
                    value={url}
                    placeholder="https://"
                    autoFocus
                    disabled={busy}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                />
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('collections.fileField.cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || url.trim() === ''}
                        onClick={() => void submit()}
                    >
                        {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {t('collections.fileField.import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FileFieldEmptyDropzone({
    acceptImagesOnly,
    disabled,
    multiple,
    onUploaded,
    onPickLibrary,
}: {
    acceptImagesOnly: boolean;
    disabled?: boolean;
    multiple?: boolean;
    onUploaded: (files: AdminFileRow[]) => void;
    onPickLibrary: () => void;
}) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [urlOpen, setUrlOpen] = useState(false);

    const busy = disabled || uploading;

    const handleLocalFiles = useCallback(
        async (fileList: FileList | File[] | null): Promise<void> => {
            if (!fileList || fileList.length === 0 || busy) {
                return;
            }

            const selected = Array.from(fileList);
            const toUpload = multiple ? selected : selected.slice(0, 1);

            setUploading(true);

            try {
                const uploaded: AdminFileRow[] = [];

                for (const file of toUpload) {
                    const row = await uploadToFilesRoot(file, acceptImagesOnly);

                    if (row) {
                        uploaded.push(row);
                    }
                }

                if (uploaded.length > 0) {
                    onUploaded(uploaded);
                } else if (acceptImagesOnly) {
                    toast.error(t('collections.fileField.imageRequired'));
                }
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('collections.fileField.uploadFailed'),
                );
            } finally {
                setUploading(false);

                if (inputRef.current) {
                    inputRef.current.value = '';
                }
            }
        },
        [acceptImagesOnly, busy, multiple, onUploaded, t],
    );

    const actionButtonClass =
        'inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

    return (
        <>
            <div
                className={cn(
                    'flex min-h-[9.5rem] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-input px-4 py-8 transition-colors',
                    dragOver && 'border-primary bg-primary/5',
                    busy && 'opacity-60',
                )}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                    if (busy || !isExternalFileDrag(event)) {
                        return;
                    }

                    event.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                    if (busy || !isExternalFileDrag(event)) {
                        return;
                    }

                    event.preventDefault();
                    setDragOver(false);
                    void handleLocalFiles(event.dataTransfer.files);
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    multiple={multiple}
                    accept={acceptImagesOnly ? 'image/*' : undefined}
                    disabled={busy}
                    onChange={(event) =>
                        void handleLocalFiles(event.target.files)
                    }
                />

                {uploading ? (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                ) : (
                    <div className="flex items-center gap-3">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className={actionButtonClass}
                                        disabled={busy}
                                        aria-label={t(
                                            'collections.fileField.uploadFromComputer',
                                        )}
                                        onClick={() => inputRef.current?.click()}
                                    >
                                        <Upload className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t(
                                        'collections.fileField.uploadFromComputer',
                                    )}
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className={actionButtonClass}
                                        disabled={busy}
                                        aria-label={t(
                                            'collections.fileField.chooseFromLibrary',
                                        )}
                                        onClick={onPickLibrary}
                                    >
                                        <FolderOpen className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t(
                                        'collections.fileField.chooseFromLibrary',
                                    )}
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className={actionButtonClass}
                                        disabled={busy}
                                        aria-label={t(
                                            'collections.fileField.importFromUrl',
                                        )}
                                        onClick={() => setUrlOpen(true)}
                                    >
                                        <Link2 className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('collections.fileField.importFromUrl')}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                )}

                <p className="text-sm text-muted-foreground">
                    {t('collections.fileField.dragAndDrop')}
                </p>
            </div>

            <UrlImportDialog
                open={urlOpen}
                onOpenChange={setUrlOpen}
                acceptImagesOnly={acceptImagesOnly}
                onImported={(file) => onUploaded([file])}
            />
        </>
    );
}

export function FileFieldInput({
    name,
    defaultFileId,
    acceptImagesOnly = false,
    readonly = false,
}: {
    name: string;
    defaultFileId: number | null;
    acceptImagesOnly?: boolean;
    readonly?: boolean;
}) {
    const { t } = useTranslation();
    const [fileId, setFileId] = useState<number | null>(defaultFileId);
    const [preview, setPreview] = useState<AdminFileRow | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    useEffect(() => {
        if (fileId === null) {
            setPreview(null);

            return;
        }

        let cancelled = false;

        void fetchFilesByIds([fileId])
            .then((files) => {
                if (!cancelled) {
                    setPreview(files[0] ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPreview(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fileId]);

    const clear = (): void => {
        setFileId(null);
        setPreview(null);
    };

    const selectFile = (file: AdminFileRow): void => {
        setFileId(file.id);
        setPreview(file);
    };

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={fileId ?? ''} />

            {fileId !== null ? (
                <div className="flex items-center gap-3 rounded-md border border-input p-3 shadow-xs">
                    {preview ? (
                        <FilePreview file={preview} size="sm" />
                    ) : (
                        <div className="size-12 shrink-0 rounded bg-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {preview?.title ||
                            preview?.name ||
                            `File #${fileId}`}
                    </span>
                    {!readonly ? (
                        <div className="flex shrink-0 gap-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPickerOpen(true)}
                            >
                                {t('collections.fileField.replace')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={t('collections.fileField.clear')}
                                onClick={clear}
                            >
                                <X className="size-4" />
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : readonly ? (
                <p className="text-sm text-muted-foreground">
                    {t('collections.fileField.noFile')}
                </p>
            ) : (
                <FileFieldEmptyDropzone
                    acceptImagesOnly={acceptImagesOnly}
                    onUploaded={(files) => {
                        const first = files[0];

                        if (first) {
                            selectFile(first);
                        }
                    }}
                    onPickLibrary={() => setPickerOpen(true)}
                />
            )}

            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={
                    acceptImagesOnly
                        ? t('collections.fileField.chooseImage')
                        : t('collections.fileField.chooseFile')
                }
                onSelect={selectFile}
            />
        </div>
    );
}

export function MultipleFilesFieldInput({
    name,
    defaultFileIds,
    acceptImagesOnly = false,
    readonly = false,
}: {
    name: string;
    defaultFileIds: number[];
    acceptImagesOnly?: boolean;
    readonly?: boolean;
}) {
    const { t } = useTranslation();
    const [fileIds, setFileIds] = useState<number[]>(defaultFileIds);
    const [previews, setPreviews] = useState<Record<number, AdminFileRow>>({});
    const [pickerOpen, setPickerOpen] = useState(false);
    // ponytail: stable dep for id list without deep-compare helpers.
    const fileIdsKey = fileIds.join(',');

    useEffect(() => {
        if (fileIds.length === 0) {
            setPreviews({});

            return;
        }

        let cancelled = false;

        void fetchFilesByIds(fileIds)
            .then((files) => {
                if (cancelled) {
                    return;
                }

                const next: Record<number, AdminFileRow> = {};

                for (const file of files) {
                    next[file.id] = file;
                }

                setPreviews(next);
            })
            .catch(() => {
                if (!cancelled) {
                    setPreviews({});
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fileIdsKey tracks fileIds
    }, [fileIdsKey]);

    const addFiles = (incoming: AdminFileRow[]): void => {
        setFileIds((current) => {
            const next = [...current];

            for (const file of incoming) {
                if (!next.includes(file.id)) {
                    next.push(file.id);
                }
            }

            return next;
        });
        setPreviews((current) => {
            const next = { ...current };

            for (const file of incoming) {
                next[file.id] = file;
            }

            return next;
        });
    };

    return (
        <div className="space-y-2">
            {fileIds.map((fileId) => (
                <input
                    key={fileId}
                    type="hidden"
                    name={`${name}[]`}
                    value={fileId}
                />
            ))}

            {fileIds.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {fileIds.map((fileId) => {
                        const file = previews[fileId];

                        return (
                            <div
                                key={fileId}
                                className="flex items-center gap-3 rounded-md border border-input p-2 shadow-xs"
                            >
                                {file ? (
                                    <FilePreview file={file} size="sm" />
                                ) : (
                                    <div className="size-12 shrink-0 rounded bg-muted" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {file?.title ||
                                        file?.name ||
                                        `File #${fileId}`}
                                </span>
                                {!readonly ? (
                                    <button
                                        type="button"
                                        className="text-xs text-muted-foreground underline"
                                        onClick={() =>
                                            setFileIds((current) =>
                                                current.filter(
                                                    (currentId) =>
                                                        currentId !== fileId,
                                                ),
                                            )
                                        }
                                    >
                                        {t('collections.fileField.remove')}
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {!readonly ? (
                <FileFieldEmptyDropzone
                    acceptImagesOnly={acceptImagesOnly}
                    multiple
                    onUploaded={addFiles}
                    onPickLibrary={() => setPickerOpen(true)}
                />
            ) : fileIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('collections.fileField.noFiles')}
                </p>
            ) : null}

            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={
                    acceptImagesOnly
                        ? t('collections.fileField.chooseImage')
                        : t('collections.fileField.chooseFile')
                }
                onSelect={(file) => addFiles([file])}
            />
        </div>
    );
}
