import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FileUploadProgress } from '@/types/files';

type FileUploadManagerProps = {
    uploads: FileUploadProgress[];
    onDismiss: (uploadId: string) => void;
    className?: string;
};

/**
 * Orchestrates chunked uploads and progress UI.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FileUploadManager({
    uploads,
    onDismiss,
    className,
}: FileUploadManagerProps) {
    if (uploads.length === 0) {
        return null;
    }

    return (
        <div
            className={cn(
                'fixed right-4 bottom-4 z-50 w-full max-w-sm space-y-2',
                className,
            )}
        >
            {uploads.map((upload) => {
                const progress =
                    upload.totalChunks > 0
                        ? Math.round(
                              (upload.uploadedChunks / upload.totalChunks) *
                                  100,
                          )
                        : 0;

                return (
                    <div
                        key={upload.uploadId}
                        className="rounded-lg border bg-card p-3 shadow-lg"
                    >
                        <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    {upload.fileName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {upload.status === 'error'
                                        ? (upload.error ?? 'Upload failed')
                                        : upload.status === 'complete'
                                          ? 'Complete'
                                          : `${progress}%`}
                                </p>
                            </div>
                            {(upload.status === 'complete' ||
                                upload.status === 'error') && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0"
                                    onClick={() => onDismiss(upload.uploadId)}
                                >
                                    <X className="size-4" />
                                </Button>
                            )}
                            {upload.status === 'uploading' && (
                                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                            )}
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn(
                                    'h-full transition-all',
                                    upload.status === 'error'
                                        ? 'bg-destructive'
                                        : 'bg-primary',
                                )}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
