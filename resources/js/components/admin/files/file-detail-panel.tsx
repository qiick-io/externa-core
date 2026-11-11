import { FileText, HardDrive, Link2, Lock, MapPin, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePreview } from '@/components/admin/files/file-preview';
import { FocalPointPicker } from '@/components/admin/files/focal-point-picker';
import type { FocalPoint } from '@/components/admin/files/focal-point-picker';
import { TagPicker } from '@/components/admin/files/tag-picker';

import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemGroup,
} from '@/components/ui/item';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
    fetchFileWhereUsed,
    filePublicUrl,
    isImageFile,
    isPlayableVideo,
    replaceFile,
    syncFileTags,
    updateFileMetadata,
} from '@/lib/files-api';
import type { FileWhereUsedReference } from '@/lib/files-api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileTag } from '@/types/files';

type AccessChoice = 'inherit' | 'public' | 'private';

function accessChoiceFromFile(file: AdminFileRow): AccessChoice {
    if (file.access === null || file.access === undefined) {
        return 'inherit';
    }

    return file.access;
}

function accessPayload(choice: AccessChoice): 'public' | 'private' | null {
    if (choice === 'inherit') {
        return null;
    }

    return choice;
}

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

function SectionHeading({
    icon: Icon,
    children,
}: {
    icon: LucideIcon;
    children: React.ReactNode;
}) {
    return (
        <FieldLegend
            variant="label"
            className="mb-0 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {children}
        </FieldLegend>
    );
}

function focalPointFromFile(file: AdminFileRow): FocalPoint | null {
    return file.focal_point_x === null || file.focal_point_y === null
        ? null
        : { x: file.focal_point_x, y: file.focal_point_y };
}

function DetailMediaPreview({ file }: { file: AdminFileRow }) {
    const publicUrl = filePublicUrl(file);

    if (publicUrl && isImageFile(file)) {
        return (
            <AspectRatio ratio={16 / 9} className="rounded bg-muted">
                <img
                    src={publicUrl}
                    alt={file.title || file.name}
                    className="size-full rounded object-contain"
                />
            </AspectRatio>
        );
    }

    if (publicUrl && isPlayableVideo(file)) {
        return (
            <AspectRatio ratio={16 / 9} className="rounded bg-black">
                <video
                    controls
                    preload="metadata"
                    src={publicUrl}
                    className="size-full rounded"
                >
                    {/* User-uploaded media has no captions track available. */}
                    <track kind="captions" />
                </video>
            </AspectRatio>
        );
    }

    return <FilePreview file={file} size="lg" />;
}

/** Extension for replace `<input accept>` — prefers `file.extension`, else parsed from name. */
function replaceAcceptAttribute(file: AdminFileRow): string | undefined {
    const fromField = file.extension?.replace(/^\./, '').trim().toLowerCase();

    if (fromField) {
        return `.${fromField}`;
    }

    const lastDot = file.name.lastIndexOf('.');

    if (lastDot > 0 && lastDot < file.name.length - 1) {
        return `.${file.name.slice(lastDot + 1).toLowerCase()}`;
    }

    // ponytail: no extension — mime type (or family) as a weak filter.
    if (file.mime_type) {
        const family = file.mime_type.split('/')[0];

        return family ? `${family}/*` : file.mime_type;
    }

    return undefined;
}

/**
 * Side panel showing metadata and preview for one file.
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
    const publicUrl = filePublicUrl(file);
    const hasFocalPoint = file.type === 'file' && isImageFile(file);
    const panelRef = useRef<HTMLElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const [title, setTitle] = useState(file.title ?? '');
    const [description, setDescription] = useState(file.description ?? '');
    const [location, setLocation] = useState(file.location ?? '');
    const [downloadName, setDownloadName] = useState(file.download_name ?? '');
    const [focalPoint, setFocalPoint] = useState<FocalPoint | null>(
        focalPointFromFile(file),
    );
    const [access, setAccess] = useState<AccessChoice>(
        accessChoiceFromFile(file),
    );
    const [tags, setTags] = useState(file.tags.map((tag) => tag.name));
    const [saving, setSaving] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [whereUsedLoading, setWhereUsedLoading] = useState(
        file.type === 'file',
    );
    const [whereUsedError, setWhereUsedError] = useState<string | null>(null);
    const [whereUsedRefs, setWhereUsedRefs] = useState<
        FileWhereUsedReference[] | null
    >(null);

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

    const [previousFile, setPreviousFile] = useState(file);
    const [previousWhereUsedScan, setPreviousWhereUsedScan] = useState({
        fileId: file.id,
        fileType: file.type,
        t,
    });

    // Reload the form during render when another file (or a fresh copy) arrives
    // (React's "adjust state on prop change" pattern).
    if (previousFile !== file) {
        setPreviousFile(file);
        setTitle(file.title ?? '');
        setDescription(file.description ?? '');
        setLocation(file.location ?? '');
        setDownloadName(file.download_name ?? '');
        setFocalPoint(focalPointFromFile(file));
        setAccess(accessChoiceFromFile(file));
        setTags(file.tags.map((tag) => tag.name));
        setWhereUsedRefs(null);
        setWhereUsedError(null);
    }

    // Mark the where-used scan as loading for the render that starts it below.
    if (
        previousWhereUsedScan.fileId !== file.id ||
        previousWhereUsedScan.fileType !== file.type ||
        previousWhereUsedScan.t !== t
    ) {
        setPreviousWhereUsedScan({ fileId: file.id, fileType: file.type, t });

        if (file.type === 'file') {
            setWhereUsedLoading(true);
            setWhereUsedError(null);
        }
    }

    useEffect(() => {
        if (file.type !== 'file') {
            return;
        }

        let cancelled = false;

        void fetchFileWhereUsed(file.id)
            .then((result) => {
                if (!cancelled) {
                    setWhereUsedRefs(result.references);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setWhereUsedError(
                        error instanceof Error
                            ? error.message
                            : t('files.detail.failedScanRefs'),
                    );
                    setWhereUsedRefs([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setWhereUsedLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [file.id, file.type, t]);

    const handleSave = async (): Promise<void> => {
        setSaving(true);

        try {
            let updated = file;

            if (canUpdateMetadata) {
                updated = await updateFileMetadata(file.id, {
                    title: title.trim() || null,
                    description: description.trim() || null,
                    location: location.trim() || null,
                    download_name: downloadName.trim() || null,
                    access: accessPayload(access),
                    // Only images carry a focal point. Translate / scale are
                    // no longer sent: nothing reads them (columns go in 1.5.0).
                    ...(hasFocalPoint
                        ? {
                              focal_point_x: focalPoint?.x ?? null,
                              focal_point_y: focalPoint?.y ?? null,
                          }
                        : {}),
                });
            }

            if (canTag) {
                updated = await syncFileTags(file.id, tags);
            }

            onUpdated(updated);
            toast.success(t('files.detail.updated'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.detail.failedSave'),
            );
        } finally {
            setSaving(false);
        }
    };

    const handleReplace = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const nextFile = event.target.files?.[0];
        event.target.value = '';

        if (!nextFile || !canReplace || file.type !== 'file') {
            return;
        }

        setReplacing(true);

        try {
            const updated = await replaceFile(file.id, nextFile);
            onUpdated(updated);
            toast.success(t('files.detail.replaced'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.detail.failedReplace'),
            );
        } finally {
            setReplacing(false);
        }
    };

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
                <div className="flex flex-col items-center gap-3">
                    {hasFocalPoint && publicUrl ? (
                        <FocalPointPicker
                            src={publicUrl}
                            alt={file.title || file.name}
                            imageWidth={file.width}
                            imageHeight={file.height}
                            value={focalPoint}
                            disabled={!canUpdateMetadata}
                            onChange={setFocalPoint}
                        />
                    ) : (
                        <DetailMediaPreview file={file} />
                    )}
                    {canReplace && file.type === 'file' && (
                        <>
                            <input
                                ref={replaceInputRef}
                                type="file"
                                accept={replaceAcceptAttribute(file)}
                                className="hidden"
                                onChange={(event) => {
                                    void handleReplace(event);
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                disabled={replacing}
                                onClick={() => replaceInputRef.current?.click()}
                            >
                                {replacing
                                    ? t('files.detail.replacing')
                                    : t('files.detail.replaceFile')}
                            </Button>
                        </>
                    )}
                </div>

                <FieldGroup className="gap-3">
                    <Field className="gap-2">
                        <FieldLabel
                            htmlFor="file-access"
                            className="flex items-center gap-2"
                        >
                            <Lock className="size-3.5" />
                            {t('files.detail.visibility')}
                        </FieldLabel>
                        <Select
                            value={access}
                            disabled={!canUpdateMetadata}
                            onValueChange={(value) =>
                                setAccess(value as AccessChoice)
                            }
                        >
                            <SelectTrigger id="file-access" className="w-full">
                                <SelectValue
                                    placeholder={t('files.detail.visibility')}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="inherit">
                                    {t('files.detail.inherit')}
                                </SelectItem>
                                <SelectItem value="public">
                                    {t('files.detail.public')}
                                </SelectItem>
                                <SelectItem value="private">
                                    {t('files.detail.private')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <FieldDescription className="text-xs">
                            {file.type === 'folder'
                                ? t('files.detail.folderVisibilityHint')
                                : t('files.detail.fileVisibilityHint', {
                                      access:
                                          file.effective_access === 'private'
                                              ? t('files.detail.private')
                                              : t('files.detail.public'),
                                  })}
                        </FieldDescription>
                    </Field>
                    <Field className="gap-2">
                        <FieldLabel htmlFor="file-title">
                            {t('files.detail.titleLabel')}
                        </FieldLabel>
                        <Input
                            id="file-title"
                            value={title}
                            disabled={!canUpdateMetadata}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </Field>
                    <Field className="gap-2">
                        <FieldLabel htmlFor="file-description">
                            {t('files.detail.descriptionLabel')}
                        </FieldLabel>
                        <Textarea
                            id="file-description"
                            value={description}
                            disabled={!canUpdateMetadata}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            rows={3}
                        />
                    </Field>
                    <Field className="gap-2">
                        <FieldLabel htmlFor="file-tags">
                            {t('files.detail.tagsLabel')}
                        </FieldLabel>
                        <FieldDescription className="text-xs">
                            {t('files.detail.tagsHint')}
                        </FieldDescription>
                        <TagPicker
                            id="file-tags"
                            value={tags}
                            onChange={setTags}
                            catalog={tagCatalog}
                            disabled={!canTag}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field className="gap-2">
                            <FieldLabel
                                htmlFor="file-location"
                                className="flex items-center gap-2"
                            >
                                <MapPin className="size-3.5" />
                                {t('files.detail.location')}
                            </FieldLabel>
                            <Input
                                id="file-location"
                                value={location}
                                disabled={!canUpdateMetadata}
                                onChange={(event) =>
                                    setLocation(event.target.value)
                                }
                            />
                        </Field>
                        <Field className="gap-2">
                            <FieldLabel
                                htmlFor="file-storage"
                                className="flex items-center gap-2"
                            >
                                <HardDrive className="size-3.5" />
                                {t('files.detail.storage')}
                            </FieldLabel>
                            <Input
                                id="file-storage"
                                value={file.disk}
                                disabled
                            />
                        </Field>
                    </div>
                    <Field className="gap-2">
                        <FieldLabel htmlFor="file-storage-path">
                            {t('files.detail.storagePath')}
                        </FieldLabel>
                        <Input
                            id="file-storage-path"
                            value={file.storage_path ?? ''}
                            disabled
                            className="font-mono"
                        />
                    </Field>
                </FieldGroup>

                <Separator />

                {file.type === 'file' && (
                    <>
                        <FieldSet className="gap-3" data-test="file-where-used">
                            <SectionHeading icon={Link2}>
                                {t('files.detail.whereUsed')}
                            </SectionHeading>
                            {whereUsedLoading && (
                                <p className="text-xs text-muted-foreground">
                                    {t('files.detail.scanningCollections')}
                                </p>
                            )}
                            {whereUsedError && (
                                <p className="text-xs text-destructive">
                                    {whereUsedError}
                                </p>
                            )}
                            {!whereUsedLoading &&
                                !whereUsedError &&
                                whereUsedRefs !== null &&
                                whereUsedRefs.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('files.detail.notReferenced')}
                                    </p>
                                )}
                            {!whereUsedLoading &&
                                whereUsedRefs !== null &&
                                whereUsedRefs.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-muted-foreground">
                                            {whereUsedRefs.length === 1
                                                ? t(
                                                      'files.detail.referenceCount',
                                                      {
                                                          count: whereUsedRefs.length,
                                                      },
                                                  )
                                                : t(
                                                      'files.detail.referenceCountPlural',
                                                      {
                                                          count: whereUsedRefs.length,
                                                      },
                                                  )}
                                        </p>
                                        <ItemGroup
                                            className="-mx-1"
                                            data-test="file-where-used-list"
                                        >
                                            {whereUsedRefs
                                                .slice(0, 20)
                                                .map((ref) => (
                                                    <Item
                                                        key={`${ref.collection_id}-${ref.item_id}-${ref.field}`}
                                                        asChild
                                                        size="sm"
                                                        role="listitem"
                                                        className="flex-nowrap gap-2 px-2 py-2 text-xs"
                                                    >
                                                        <a
                                                            href={`/collections/${ref.collection_id}/items/${ref.item_id}`}
                                                        >
                                                            <ItemContent className="min-w-0 flex-row items-center gap-2">
                                                                <span className="min-w-0 truncate font-medium">
                                                                    {
                                                                        ref.collection_name
                                                                    }
                                                                </span>
                                                                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                                                                    #
                                                                    {
                                                                        ref.item_id
                                                                    }
                                                                </span>
                                                            </ItemContent>
                                                            <ItemActions className="shrink-0 text-muted-foreground">
                                                                {ref.field}
                                                            </ItemActions>
                                                        </a>
                                                    </Item>
                                                ))}
                                            {whereUsedRefs.length > 20 && (
                                                <p
                                                    role="listitem"
                                                    className="w-full px-2 py-2 text-xs text-muted-foreground"
                                                >
                                                    {t(
                                                        'files.detail.moreRefs',
                                                        {
                                                            count:
                                                                whereUsedRefs.length -
                                                                20,
                                                        },
                                                    )}
                                                </p>
                                            )}
                                        </ItemGroup>
                                    </div>
                                )}
                        </FieldSet>
                        <Separator />
                    </>
                )}

                <FieldSet className="gap-3">
                    <SectionHeading icon={FileText}>
                        {t('files.detail.fileNaming')}
                    </SectionHeading>
                    <div className="space-y-3">
                        <Field className="gap-2">
                            <FieldLabel htmlFor="file-disk-name">
                                {t('files.detail.diskName')}
                            </FieldLabel>
                            <Input
                                id="file-disk-name"
                                value={file.name}
                                disabled
                                className="font-mono"
                            />
                        </Field>
                        <Field className="gap-2">
                            <FieldLabel htmlFor="download-name">
                                {t('files.detail.downloadName')}
                            </FieldLabel>
                            <Input
                                id="download-name"
                                value={downloadName}
                                disabled={!canUpdateMetadata}
                                onChange={(event) =>
                                    setDownloadName(event.target.value)
                                }
                            />
                        </Field>
                    </div>
                </FieldSet>
            </div>

            {canSave && (
                <div className="border-t p-4">
                    <Button
                        type="button"
                        className="w-full"
                        disabled={saving}
                        onClick={() => {
                            void handleSave();
                        }}
                    >
                        {saving ? t('files.saving') : t('common.save')}
                    </Button>
                </div>
            )}
        </aside>
    );
}
