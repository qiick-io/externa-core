import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDetailMedia } from '@/components/admin/files/file-detail-media';
import {
    FileDetailMetadataFields,
    FileNamingSection,
    FileWhereUsedSection,
} from '@/components/admin/files/file-detail-sections';
import { useFileDetailForm } from '@/components/admin/files/use-file-detail-form';
import { useFileWhereUsed } from '@/components/admin/files/use-file-where-used';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileTag } from '@/types/files';

type FileDetailPanelProps = {
    file: AdminFileRow;
    canUpdateMetadata: boolean;
    canTag: boolean;
    canReplace: boolean;
    tagCatalog: FileTag[];
    onClose: () => void;
    onUpdated: (file: AdminFileRow) => void;
    /** `aside` = file manager column; `sheet` = overlay drawer from fields. */
    presentation?: 'aside' | 'sheet';
};

/**
 * Side panel showing metadata and preview for one file. The form state lives
 * in useFileDetailForm, the reference scan in useFileWhereUsed; the sections
 * are in file-detail-media and file-detail-sections.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FileDetailPanel({
    file,
    canUpdateMetadata,
    canTag,
    canReplace,
    tagCatalog,
    onClose,
    onUpdated,
    presentation = 'aside',
}: FileDetailPanelProps) {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const form = useFileDetailForm({
        file,
        canUpdateMetadata,
        canTag,
        onUpdated,
    });
    const whereUsed = useFileWhereUsed(file);

    useEffect(() => {
        // Sheet/Dialog already trap focus; aside panel needs open/close restore.
        if (presentation !== 'aside') {
            return;
        }

        previousFocusRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        const frame = window.requestAnimationFrame(() => {
            panelRef.current?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);
            previousFocusRef.current?.focus();
        };
    }, [presentation, file.id]);

    const canSave = canUpdateMetadata || canTag;

    return (
        <aside
            ref={panelRef}
            tabIndex={-1}
            role={presentation === 'aside' ? 'dialog' : undefined}
            aria-modal={presentation === 'aside' ? false : undefined}
            aria-label={t('files.detail.title')}
            className={cn(
                'flex flex-col bg-card outline-none',
                presentation === 'aside' &&
                    'w-[min(100%,380px)] shrink-0 border-l border-sidebar-border/70',
                presentation === 'sheet' && 'h-full min-h-0 w-full',
            )}
        >
            <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">
                    {t('files.detail.title')}
                </h2>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    aria-label={t('files.detail.close')}
                >
                    <X className="size-4" aria-hidden="true" />
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <FileDetailMedia
                    file={file}
                    hasFocalPoint={form.hasFocalPoint}
                    focalPoint={form.focalPoint}
                    onFocalPointChange={form.setFocalPoint}
                    canUpdateMetadata={canUpdateMetadata}
                    canReplace={canReplace}
                    onUpdated={onUpdated}
                />

                <FileDetailMetadataFields
                    file={file}
                    form={form}
                    canUpdateMetadata={canUpdateMetadata}
                    canTag={canTag}
                    tagCatalog={tagCatalog}
                />

                <Separator />

                {file.type === 'file' && (
                    <>
                        <FileWhereUsedSection
                            whereUsedLoading={whereUsed.whereUsedLoading}
                            whereUsedError={whereUsed.whereUsedError}
                            whereUsedRefs={whereUsed.whereUsedRefs}
                        />
                        <Separator />
                    </>
                )}

                <FileNamingSection
                    file={file}
                    downloadName={form.downloadName}
                    onDownloadNameChange={form.setDownloadName}
                    canUpdateMetadata={canUpdateMetadata}
                />
            </div>

            {canSave && (
                <div className="border-t p-4">
                    <Button
                        type="button"
                        className="w-full"
                        disabled={form.saving}
                        onClick={() => {
                            void form.handleSave();
                        }}
                    >
                        {form.saving ? t('files.saving') : t('common.save')}
                    </Button>
                </div>
            )}
        </aside>
    );
}
