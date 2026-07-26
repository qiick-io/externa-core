import { Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const INTERNAL_FILE_DRAG_TYPE = 'application/x-externa-file-id';

function isInternalFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(
        INTERNAL_FILE_DRAG_TYPE,
    );
}

function isExternalFileDrag(event: DragEvent): boolean {
    if (isInternalFileDrag(event)) {
        return false;
    }

    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

type FileDropzoneProps = {
    onFilesSelected: (files: FileList | File[]) => void;
    onItemsDropped?: (items: DataTransferItemList) => void;
    disabled?: boolean;
    className?: string;
    compact?: boolean;
    children?: ReactNode;
    showInlineEmptyState?: boolean;
};

/**
 * Drag-and-drop upload zone for the file manager.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FileDropzone({
    onFilesSelected,
    onItemsDropped,
    disabled = false,
    className,
    compact = false,
    children,
    showInlineEmptyState = false,
}: FileDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [pageDragOver, setPageDragOver] = useState(false);

    const resetPageDragState = useCallback((): void => {
        setPageDragOver(false);
    }, []);

    useEffect(() => {
        if (disabled || children === undefined) {
            return;
        }

        const endExternalDrag = (): void => {
            resetPageDragState();
        };

        window.addEventListener('dragend', endExternalDrag);
        window.addEventListener('drop', endExternalDrag);

        return () => {
            window.removeEventListener('dragend', endExternalDrag);
            window.removeEventListener('drop', endExternalDrag);
        };
    }, [children, disabled, resetPageDragState]);

    const handleFiles = useCallback(
        (fileList: FileList | File[] | null) => {
            if (!fileList || fileList.length === 0 || disabled) {
                return;
            }

            onFilesSelected(fileList);

            if (inputRef.current) {
                inputRef.current.value = '';
            }
        },
        [disabled, onFilesSelected],
    );

    const handlePageDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setPageDragOver(true);
    };

    const handlePageDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setPageDragOver(true);
    };

    const handlePageDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled) {
            return;
        }

        const relatedTarget = event.relatedTarget;

        if (
            relatedTarget instanceof Node &&
            event.currentTarget.contains(relatedTarget)
        ) {
            return;
        }

        resetPageDragState();
    };

    const handlePageDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || isInternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        resetPageDragState();

        const items = event.dataTransfer.items;

        if (items && items.length > 0 && onItemsDropped) {
            onItemsDropped(items);

            return;
        }

        if (event.dataTransfer.files.length > 0) {
            handleFiles(event.dataTransfer.files);
        }
    };

    const openFilePicker = (): void => {
        inputRef.current?.click();
    };

    const hiddenInput = (
        <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(event) => handleFiles(event.target.files)}
        />
    );

    if (children !== undefined) {
        return (
            <div
                className={cn(
                    'relative flex h-full min-h-0 w-full flex-1 flex-col',
                    className,
                )}
                onDragEnter={handlePageDragEnter}
                onDragOver={handlePageDragOver}
                onDragLeave={handlePageDragLeave}
                onDrop={handlePageDrop}
            >
                {hiddenInput}
                {children}
                {pageDragOver && !disabled && (
                    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10">
                        <div className="pointer-events-none rounded-lg border bg-card p-8 shadow-lg">
                            <p className="text-sm font-semibold">
                                Drop files here to upload
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Large files use chunked upload automatically
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (!showInlineEmptyState) {
        return hiddenInput;
    }

    return (
        <div
            className={cn(
                'relative rounded-xl border border-dashed transition-colors',
                dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-sidebar-border/70 bg-muted/20',
                compact ? 'p-4' : 'p-8',
                disabled && 'pointer-events-none opacity-50',
                className,
            )}
            onDragOver={(event) => {
                if (disabled || !isExternalFileDrag(event)) {
                    return;
                }

                event.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
                if (disabled || !isExternalFileDrag(event)) {
                    return;
                }

                event.preventDefault();
                setDragOver(false);

                const items = event.dataTransfer.items;

                if (items && items.length > 0 && onItemsDropped) {
                    onItemsDropped(items);

                    return;
                }

                handleFiles(event.dataTransfer.files);
            }}
        >
            {hiddenInput}
            <div className="flex flex-col items-center justify-center gap-3 text-center">
                <Upload className="size-8 text-muted-foreground" />
                <div>
                    <p className="text-sm font-medium">
                        Drop files here or browse
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Large files use chunked upload automatically
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={openFilePicker}
                >
                    Choose files
                </Button>
            </div>
        </div>
    );
}

export { INTERNAL_FILE_DRAG_TYPE, isExternalFileDrag, isInternalFileDrag };
