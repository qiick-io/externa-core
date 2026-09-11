import type { TFunction } from 'i18next';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Loader2,
    X,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { FileUploadProgress } from '@/types/files';

type FileUploadIndicatorProps = {
    uploads: FileUploadProgress[];
    onDismiss: (uploadId: string) => void;
    onDismissAll: () => void;
    className?: string;
};

function uploadProgressPercent(upload: FileUploadProgress): number {
    if (upload.status === 'complete') {
        return 100;
    }

    if (upload.kind === 'batch' && upload.totalBytes && upload.totalBytes > 0) {
        return Math.round(
            ((upload.uploadedBytes ?? 0) / upload.totalBytes) * 100,
        );
    }

    if (upload.totalChunks <= 0) {
        return 0;
    }

    return Math.round((upload.uploadedChunks / upload.totalChunks) * 100);
}

function uploadStatusLabel(upload: FileUploadProgress, t: TFunction): string {
    if (upload.status === 'error') {
        return upload.error ?? t('files.uploadIndicator.failed');
    }

    if (upload.status === 'complete') {
        return t('files.uploadIndicator.complete');
    }

    if (upload.kind === 'batch' && upload.totalFiles) {
        const progress = uploadProgressPercent(upload);
        const uploadedFiles = upload.uploadedFiles ?? 0;

        return t('files.uploadIndicator.batchProgress', {
            percent: progress,
            uploaded: uploadedFiles,
            total: upload.totalFiles,
        });
    }

    return `${uploadProgressPercent(upload)}%`;
}

function buildSummaryLabel(uploads: FileUploadProgress[], t: TFunction): string {
    const activeUploads = uploads.filter(
        (upload) =>
            upload.status === 'pending' || upload.status === 'uploading',
    );
    const completedUploads = uploads.filter(
        (upload) => upload.status === 'complete',
    );
    const errorUploads = uploads.filter((upload) => upload.status === 'error');

    if (activeUploads.length > 0) {
        if (completedUploads.length > 0) {
            return t('files.uploadIndicator.uploadingWithCompleted', {
                active: activeUploads.length,
                completed: completedUploads.length,
            });
        }

        return t('files.uploadIndicator.uploading', {
            count: activeUploads.length,
        });
    }

    if (errorUploads.length > 0 && completedUploads.length > 0) {
        return t('files.uploadIndicator.completedWithFailed', {
            completed: completedUploads.length,
            failed: errorUploads.length,
        });
    }

    if (errorUploads.length > 0) {
        return t('files.uploadIndicator.failedCount', {
            count: errorUploads.length,
        });
    }

    if (completedUploads.length === 1) {
        return t('files.uploadIndicator.oneComplete');
    }

    return t('files.uploadIndicator.manyComplete', {
        count: completedUploads.length,
    });
}

/**
 * Floating progress indicator for active uploads.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FileUploadIndicator({
    uploads,
    onDismiss,
    onDismissAll,
    className,
}: FileUploadIndicatorProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(true);

    const activeCount = useMemo(
        () =>
            uploads.filter(
                (upload) =>
                    upload.status === 'pending' ||
                    upload.status === 'uploading',
            ).length,
        [uploads],
    );

    useEffect(() => {
        if (activeCount > 0) {
            setExpanded(true);
        }
    }, [activeCount]);

    if (uploads.length === 0) {
        return null;
    }

    const summaryLabel = buildSummaryLabel(uploads, t);
    const allFinished = activeCount === 0;

    return (
        <div
            className={cn(
                'fixed right-4 bottom-4 z-50 w-full max-w-sm',
                className,
            )}
        >
            <Collapsible open={expanded} onOpenChange={setExpanded}>
                <div className="overflow-hidden rounded-xl border bg-card shadow-xl">
                    <div className="flex items-center gap-2 border-b px-3 py-2.5">
                        {activeCount > 0 ? (
                            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        ) : uploads.some(
                              (upload) => upload.status === 'error',
                          ) ? (
                            <XCircle className="size-4 shrink-0 text-destructive" />
                        ) : (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                        )}
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                            {summaryLabel}
                        </p>
                        <CollapsibleTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                aria-label={
                                    expanded
                                        ? t('files.uploadIndicator.minimize')
                                        : t('files.uploadIndicator.expand')
                                }
                            >
                                {expanded ? (
                                    <ChevronDown className="size-4" />
                                ) : (
                                    <ChevronUp className="size-4" />
                                )}
                            </Button>
                        </CollapsibleTrigger>
                        {allFinished && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                aria-label={t('files.uploadIndicator.close')}
                                onClick={onDismissAll}
                            >
                                <X className="size-4" />
                            </Button>
                        )}
                    </div>

                    <CollapsibleContent>
                        <ul className="max-h-64 space-y-0 overflow-y-auto">
                            {uploads.map((upload) => {
                                const progress = uploadProgressPercent(upload);

                                return (
                                    <li
                                        key={upload.uploadId}
                                        className="border-b px-3 py-2.5 last:border-b-0"
                                    >
                                        <div className="mb-1.5 flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {upload.fileName}
                                                </p>
                                                <p
                                                    className={cn(
                                                        'text-xs',
                                                        upload.status ===
                                                            'error'
                                                            ? 'text-destructive'
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {uploadStatusLabel(
                                                        upload,
                                                        t,
                                                    )}
                                                </p>
                                            </div>
                                            {upload.status === 'complete' && (
                                                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                                            )}
                                            {upload.status === 'error' && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-7 shrink-0"
                                                    onClick={() =>
                                                        onDismiss(
                                                            upload.uploadId,
                                                        )
                                                    }
                                                >
                                                    <X className="size-4" />
                                                </Button>
                                            )}
                                            {(upload.status === 'pending' ||
                                                upload.status ===
                                                    'uploading') && (
                                                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className={cn(
                                                    'h-full transition-all',
                                                    upload.status === 'error'
                                                        ? 'bg-destructive'
                                                        : upload.status ===
                                                            'complete'
                                                          ? 'bg-emerald-600'
                                                          : 'bg-primary',
                                                )}
                                                style={{
                                                    width: `${progress}%`,
                                                }}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </CollapsibleContent>
                </div>
            </Collapsible>
        </div>
    );
}
