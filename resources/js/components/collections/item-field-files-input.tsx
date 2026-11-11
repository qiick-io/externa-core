import { usePage } from '@inertiajs/react';
import {
    Download,
    FolderOpen,
    Link2,
    Pencil,
    Upload,
    X,
    ZoomIn,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { FileUrlImportDialog } from '@/components/admin/file-url-import-dialog';
import { FileDetailDrawer } from '@/components/admin/files/file-detail-drawer';
import { FilePreview } from '@/components/admin/files/file-preview';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { fileFieldImageSources } from '@/lib/file-field-image';
import {
    CHUNK_SIZE_BYTES,
    downloadFileUrl,
    fetchFilesByIds,
    filePublicUrl,
    formatFileSize,
    listFileTagsCatalog,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import { formatNumber } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileTag } from '@/types/files';

/** Same footprint as the empty dashed dropzone so a selected image fills that slot. */
const FILE_FIELD_SLOT_CLASS = 'min-h-[9.5rem] w-full rounded-md';

const imageHoverActionClass =
    'inline-flex size-9 items-center justify-center rounded-md bg-white/15 text-white transition-colors hover:bg-white/25 disabled:pointer-events-none disabled:opacity-50';

/**
 * meta line: `1,320 × 1,000 • 23.3 KB • image/png`.
 */
function formatImageFieldMetaLine(file: AdminFileRow): string {
    const parts: string[] = [];

    if (file.width && file.height) {
        parts.push(
            `${formatNumber(file.width)} \u00d7 ${formatNumber(file.height)}`,
        );
    }

    if (file.size !== null && file.size > 0) {
        parts.push(formatFileSize(file.size));
    }

    if (file.mime_type) {
        parts.push(file.mime_type);
    }

    return parts.join(' \u2022 ');
}

async function uploadToFilesRoot(
    file: File,
    acceptImagesOnly: boolean,
    maxBytes?: number | null,
): Promise<AdminFileRow | null> {
    if (acceptImagesOnly && !file.type.startsWith('image/')) {
        return null;
    }

    if (file.size > CHUNK_SIZE_BYTES) {
        return uploadFileChunked(file, null, undefined, maxBytes);
    }

    return uploadFileDirect(file, null, maxBytes);
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
    const { projectSettings } = usePage().props;
    const filesMaxUploadBytes = projectSettings?.filesMaxUploadBytes ?? null;
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
                    const row = await uploadToFilesRoot(
                        file,
                        acceptImagesOnly,
                        filesMaxUploadBytes,
                    );

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
        [acceptImagesOnly, busy, filesMaxUploadBytes, multiple, onUploaded, t],
    );

    return (
        <>
            <div
                className={cn(
                    'flex flex-col items-center justify-center gap-3 border border-dashed border-input px-4 py-8 transition-colors',
                    FILE_FIELD_SLOT_CLASS,
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
                    <Spinner className="size-6 text-muted-foreground" />
                ) : (
                    <div className="flex items-center gap-3">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon-lg"
                                    className="rounded-full"
                                    disabled={busy}
                                    aria-label={t(
                                        'collections.fileField.uploadFromComputer',
                                    )}
                                    onClick={() => inputRef.current?.click()}
                                >
                                    <Upload className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('collections.fileField.uploadFromComputer')}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon-lg"
                                    className="rounded-full"
                                    disabled={busy}
                                    aria-label={t(
                                        'collections.fileField.chooseFromLibrary',
                                    )}
                                    onClick={onPickLibrary}
                                >
                                    <FolderOpen className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('collections.fileField.chooseFromLibrary')}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon-lg"
                                    className="rounded-full"
                                    disabled={busy}
                                    aria-label={t(
                                        'collections.fileField.importFromUrl',
                                    )}
                                    onClick={() => setUrlOpen(true)}
                                >
                                    <Link2 className="size-4" />
                                </Button>
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

            <FileUrlImportDialog
                open={urlOpen}
                onOpenChange={setUrlOpen}
                acceptImagesOnly={acceptImagesOnly}
                onImported={(file) => onUploaded([file])}
            />
        </>
    );
}

/**
 * Selected single-image preview: fills the dropzone slot; hover shows meta + actions.
 * ponytail: no inline image-editor (sliders) — crop/focal lives in the file manager.
 */
function SingleImageFilledPreview({
    file,
    fileId,
    readonly,
    onEdit,
    onClear,
}: {
    file: AdminFileRow | null;
    fileId: number;
    readonly?: boolean;
    onEdit: () => void;
    onClear: () => void;
}) {
    const { t } = useTranslation();
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const publicUrl = file ? filePublicUrl(file) : null;
    const imageSources = file ? fileFieldImageSources(file) : null;
    const displayName = file?.title || file?.name || `File #${fileId}`;
    const metaLine = file ? formatImageFieldMetaLine(file) : '';

    return (
        <>
            <AspectRatio
                ratio={16 / 9}
                className="group overflow-hidden rounded-md bg-muted"
            >
                {imageSources ? (
                    <img
                        src={imageSources.src}
                        srcSet={imageSources.srcSet}
                        sizes={imageSources.sizes}
                        alt={displayName}
                        className="absolute inset-0 size-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 bg-muted" />
                )}

                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                    <div className="absolute inset-0 bg-black/50" />
                    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2">
                        {publicUrl ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className={imageHoverActionClass}
                                        aria-label={t(
                                            'collections.fileField.preview',
                                        )}
                                        onClick={() => setLightboxOpen(true)}
                                    >
                                        <ZoomIn className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('collections.fileField.preview')}
                                </TooltipContent>
                            </Tooltip>
                        ) : null}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <a
                                    className={imageHoverActionClass}
                                    href={downloadFileUrl(fileId)}
                                    aria-label={t(
                                        'collections.fileField.download',
                                    )}
                                >
                                    <Download className="size-4" />
                                </a>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('collections.fileField.download')}
                            </TooltipContent>
                        </Tooltip>

                        {!readonly ? (
                            <>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className={imageHoverActionClass}
                                            aria-label={t(
                                                'collections.fileField.editItem',
                                            )}
                                            onClick={onEdit}
                                        >
                                            <Pencil className="size-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('collections.fileField.editItem')}
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className={imageHoverActionClass}
                                            aria-label={t(
                                                'collections.fileField.remove',
                                            )}
                                            onClick={onClear}
                                        >
                                            <X className="size-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('collections.fileField.remove')}
                                    </TooltipContent>
                                </Tooltip>
                            </>
                        ) : null}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 pb-3 text-left text-xs text-white">
                        <p className="truncate font-medium">{displayName}</p>
                        {metaLine !== '' ? (
                            <p className="truncate text-white/80">{metaLine}</p>
                        ) : null}
                    </div>
                </div>
            </AspectRatio>

            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="max-h-[90vh] max-w-[90vw] border-0 bg-black p-2 sm:max-w-[90vw]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{displayName}</DialogTitle>
                    </DialogHeader>
                    {publicUrl ? (
                        <img
                            src={publicUrl}
                            alt={displayName}
                            className="max-h-[85vh] w-full object-contain"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
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
    const { can } = useCan();
    const [fileId, setFileId] = useState<number | null>(defaultFileId);
    const [preview, setPreview] = useState<AdminFileRow | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [tagCatalog, setTagCatalog] = useState<FileTag[]>([]);

    const canUpdateMetadata = can(PermissionEnum.CanUpdateFileMetadata);
    const canTag = can(PermissionEnum.CanTagFiles);
    const canReplaceFile = can(PermissionEnum.CanReplaceFiles);

    useEffect(() => {
        // Clearing the field already resets the preview in `clear`; nothing to fetch.
        if (fileId === null) {
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

    useEffect(() => {
        if (!detailOpen) {
            return;
        }

        let cancelled = false;

        void listFileTagsCatalog()
            .then((tags) => {
                if (!cancelled) {
                    setTagCatalog(tags);
                }
            })
            .catch(() => {
                // Best-effort; panel still works without catalog.
            });

        return () => {
            cancelled = true;
        };
    }, [detailOpen]);

    const clear = (): void => {
        setFileId(null);
        setPreview(null);
        setDetailOpen(false);
    };

    const selectFile = (file: AdminFileRow): void => {
        setFileId(file.id);
        setPreview(file);
    };

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={fileId ?? ''} />

            {fileId !== null ? (
                acceptImagesOnly ? (
                    <SingleImageFilledPreview
                        file={preview}
                        fileId={fileId}
                        readonly={readonly}
                        onEdit={() => {
                            if (preview) {
                                setDetailOpen(true);
                            }
                        }}
                        onClear={clear}
                    />
                ) : (
                    <Item
                        variant="outline"
                        size="sm"
                        className="flex-nowrap border-input p-3 shadow-xs"
                    >
                        <ItemMedia>
                            {preview ? (
                                <FilePreview file={preview} size="sm" />
                            ) : (
                                <div className="size-12 shrink-0 rounded bg-muted" />
                            )}
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate">
                                {preview?.title ||
                                    preview?.name ||
                                    `File #${fileId}`}
                            </ItemTitle>
                        </ItemContent>
                        {!readonly ? (
                            <ItemActions className="shrink-0 gap-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!preview}
                                    onClick={() => setDetailOpen(true)}
                                >
                                    {t('collections.fileField.editItem')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setPickerOpen(true)}
                                >
                                    {t('collections.fileField.replace')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t(
                                        'collections.fileField.clear',
                                    )}
                                    onClick={clear}
                                >
                                    <X className="size-4" />
                                </Button>
                            </ItemActions>
                        ) : null}
                    </Item>
                )
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
                onSelect={(files) => {
                    const first = files[0];

                    if (first) {
                        selectFile(first);
                    }
                }}
            />

            <FileDetailDrawer
                file={preview}
                open={detailOpen && preview !== null}
                onOpenChange={setDetailOpen}
                canUpdateMetadata={canUpdateMetadata}
                canTag={canTag}
                canReplace={canReplaceFile}
                tagCatalog={tagCatalog}
                onUpdated={(updated) => {
                    setPreview(updated);
                    setFileId(updated.id);
                    void listFileTagsCatalog()
                        .then(setTagCatalog)
                        .catch(() => {});
                }}
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
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- fileIdsKey tracks fileIds
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
                <ItemGroup className="gap-2">
                    {fileIds.map((fileId) => {
                        const file = previews[fileId];

                        return (
                            <Item
                                key={fileId}
                                role="listitem"
                                variant="outline"
                                size="sm"
                                className="flex-nowrap border-input p-2 shadow-xs"
                            >
                                <ItemMedia>
                                    {file ? (
                                        <FilePreview file={file} size="sm" />
                                    ) : (
                                        <div className="size-12 shrink-0 rounded bg-muted" />
                                    )}
                                </ItemMedia>
                                <ItemContent className="min-w-0">
                                    <ItemTitle className="w-full truncate">
                                        {file?.title ||
                                            file?.name ||
                                            `File #${fileId}`}
                                    </ItemTitle>
                                </ItemContent>
                                {!readonly ? (
                                    <Button
                                        type="button"
                                        variant="link"
                                        size="sm"
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
                                    </Button>
                                ) : null}
                            </Item>
                        );
                    })}
                </ItemGroup>
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
                multiple
                title={
                    acceptImagesOnly
                        ? t('collections.fileField.chooseImage')
                        : t('collections.fileField.chooseFiles', {
                              defaultValue: 'Choose files',
                          })
                }
                onSelect={(files) => addFiles(files)}
            />
        </div>
    );
}
