import { useEffect, useState } from 'react';

import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { FilePreview } from '@/components/admin/files/file-preview';
import { Button } from '@/components/ui/button';
import { fetchFilesByIds } from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

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

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={fileId ?? ''} />
            {preview ? (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                    <FilePreview file={preview} size="sm" />
                    <span className="min-w-0 truncate text-sm font-medium">
                        {preview.title || preview.name}
                    </span>
                </div>
            ) : fileId ? (
                <p className="text-sm text-muted-foreground">File #{fileId}</p>
            ) : null}
            {!readonly ? (
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                    >
                        {fileId ? 'Change file' : 'Choose file'}
                    </Button>
                    {fileId !== null && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setFileId(null);
                                setPreview(null);
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            ) : null}
            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={acceptImagesOnly ? 'Choose image' : 'Choose file'}
                onSelect={(file) => {
                    setFileId(file.id);
                    setPreview(file);
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
                                className="flex items-center gap-3 rounded-lg border p-2"
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
                                        Remove
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    No files selected
                </p>
            )}
            {!readonly ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                >
                    Add {acceptImagesOnly ? 'image' : 'file'}
                </Button>
            ) : null}
            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={acceptImagesOnly ? 'Choose image' : 'Choose file'}
                onSelect={(file) => {
                    setFileIds((current) =>
                        current.includes(file.id)
                            ? current
                            : [...current, file.id],
                    );
                    setPreviews((current) => ({
                        ...current,
                        [file.id]: file,
                    }));
                }}
            />
        </div>
    );
}
