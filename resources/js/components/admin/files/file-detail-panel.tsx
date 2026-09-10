import {
    FileText,
    HardDrive,
    ImageIcon,
    Link2,
    Lock,
    MapPin,
    MoveHorizontal,
    MoveVertical,
    Scaling,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePreview } from '@/components/admin/files/file-preview';
import { TagPicker } from '@/components/admin/files/tag-picker';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    updateFileMetadata
    
} from '@/lib/files-api';
import type {FileWhereUsedReference} from '@/lib/files-api';
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
        <div className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {children}
            </h3>
        </div>
    );
}

function optionalNumberString(value: number | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
}

function DetailMediaPreview({ file }: { file: AdminFileRow }) {
    const publicUrl = filePublicUrl(file);

    if (publicUrl && isImageFile(file)) {
        return (
            <img
                src={publicUrl}
                alt={file.title || file.name}
                className="max-h-64 w-full rounded object-contain"
            />
        );
    }

    if (publicUrl && isPlayableVideo(file)) {
        return (
            <video
                controls
                preload="metadata"
                src={publicUrl}
                className="max-h-64 w-full rounded bg-black"
            />
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
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const [title, setTitle] = useState(file.title ?? '');
    const [description, setDescription] = useState(file.description ?? '');
    const [location, setLocation] = useState(file.location ?? '');
    const [downloadName, setDownloadName] = useState(file.download_name ?? '');
    const [focalX, setFocalX] = useState(
        optionalNumberString(file.focal_point_x),
    );
    const [focalY, setFocalY] = useState(
        optionalNumberString(file.focal_point_y),
    );
    const [translateX, setTranslateX] = useState(
        optionalNumberString(file.translate_x),
    );
    const [translateY, setTranslateY] = useState(
        optionalNumberString(file.translate_y),
    );
    const [scale, setScale] = useState(optionalNumberString(file.scale));
    const [access, setAccess] = useState<AccessChoice>(
        accessChoiceFromFile(file),
    );
    const [tags, setTags] = useState(file.tags.map((tag) => tag.name));
    const [saving, setSaving] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [whereUsedLoading, setWhereUsedLoading] = useState(false);
    const [whereUsedError, setWhereUsedError] = useState<string | null>(null);
    const [whereUsedRefs, setWhereUsedRefs] = useState<
        FileWhereUsedReference[] | null
    >(null);

    useEffect(() => {
        setTitle(file.title ?? '');
        setDescription(file.description ?? '');
        setLocation(file.location ?? '');
        setDownloadName(file.download_name ?? '');
        setFocalX(optionalNumberString(file.focal_point_x));
        setFocalY(optionalNumberString(file.focal_point_y));
        setTranslateX(optionalNumberString(file.translate_x));
        setTranslateY(optionalNumberString(file.translate_y));
        setScale(optionalNumberString(file.scale));
        setAccess(accessChoiceFromFile(file));
        setTags(file.tags.map((tag) => tag.name));
        setWhereUsedRefs(null);
        setWhereUsedError(null);
    }, [file]);

    useEffect(() => {
        if (file.type !== 'file') {
            return;
        }

        let cancelled = false;
        setWhereUsedLoading(true);
        setWhereUsedError(null);

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

    const parseOptionalNumber = (value: string): number | null => {
        if (value.trim() === '') {
            return null;
        }

        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    };

    const handleSave = async (): Promise<void> => {
        setSaving(true);

        try {
            let updated = file;

            if (canUpdateMetadata) {
                const numericFields = {
                    focal_point_x: parseOptionalNumber(focalX),
                    focal_point_y: parseOptionalNumber(focalY),
                    translate_x: parseOptionalNumber(translateX),
                    translate_y: parseOptionalNumber(translateY),
                    scale: parseOptionalNumber(scale),
                };

                const invalidNumericField = (
                    [
                        [
                            t('files.detail.focalX'),
                            focalX,
                            numericFields.focal_point_x,
                        ],
                        [
                            t('files.detail.focalY'),
                            focalY,
                            numericFields.focal_point_y,
                        ],
                        [
                            t('files.detail.translateX'),
                            translateX,
                            numericFields.translate_x,
                        ],
                        [
                            t('files.detail.translateY'),
                            translateY,
                            numericFields.translate_y,
                        ],
                        [t('files.detail.scale'), scale, numericFields.scale],
                    ] as const
                ).find(
                    ([, rawValue, parsedValue]) =>
                        rawValue.trim() !== '' && parsedValue === null,
                );

                if (invalidNumericField) {
                    toast.error(
                        t('files.detail.mustBeNumber', {
                            field: invalidNumericField[0],
                        }),
                    );

                    return;
                }

                updated = await updateFileMetadata(file.id, {
                    title: title.trim() || null,
                    description: description.trim() || null,
                    location: location.trim() || null,
                    download_name: downloadName.trim() || null,
                    access: accessPayload(access),
                    ...numericFields,
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
    const numberInputClassName = cn('tabular-nums');

    return (
        <aside
            className={cn(
                'flex flex-col bg-card',
                presentation === 'aside' &&
                    'w-[380px] shrink-0 border-l border-sidebar-border/70',
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
                    <X className="size-4" />
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <div className="flex flex-col items-center gap-3">
                    <DetailMediaPreview file={file} />
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
                                size="sm"
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

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label
                            htmlFor="file-access"
                            className="flex items-center gap-1.5"
                        >
                            <Lock className="size-3.5" />
                            {t('files.detail.visibility')}
                        </Label>
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
                        <p className="text-xs text-muted-foreground">
                            {file.type === 'folder'
                                ? t('files.detail.folderVisibilityHint')
                                : t('files.detail.fileVisibilityHint', {
                                      access:
                                          file.effective_access === 'private'
                                              ? t('files.detail.private')
                                              : t('files.detail.public'),
                                  })}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="file-title">
                            {t('files.detail.titleLabel')}
                        </Label>
                        <Input
                            id="file-title"
                            value={title}
                            disabled={!canUpdateMetadata}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="file-description">
                            {t('files.detail.descriptionLabel')}
                        </Label>
                        <Textarea
                            id="file-description"
                            value={description}
                            disabled={!canUpdateMetadata}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            rows={3}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="file-tags">
                            {t('files.detail.tagsLabel')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t('files.detail.tagsHint')}
                        </p>
                        <TagPicker
                            id="file-tags"
                            value={tags}
                            onChange={setTags}
                            catalog={tagCatalog}
                            disabled={!canTag}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="file-location"
                                className="flex items-center gap-1.5"
                            >
                                <MapPin className="size-3.5" />
                                {t('files.detail.location')}
                            </Label>
                            <Input
                                id="file-location"
                                value={location}
                                disabled={!canUpdateMetadata}
                                onChange={(event) =>
                                    setLocation(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5">
                                <HardDrive className="size-3.5" />
                                {t('files.detail.storage')}
                            </Label>
                            <Input value={file.disk} disabled />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('files.detail.storagePath')}</Label>
                        <Input
                            value={file.storage_path ?? ''}
                            disabled
                            className="font-mono text-xs"
                        />
                    </div>
                </div>

                <Separator />

                {file.type === 'file' && (
                    <>
                        <div
                            className="space-y-3"
                            data-test="file-where-used"
                        >
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
                                    <ul className="space-y-2 text-xs">
                                        <li className="text-muted-foreground">
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
                                        </li>
                                        {whereUsedRefs.slice(0, 20).map((ref) => (
                                            <li key={`${ref.collection_id}-${ref.item_id}-${ref.field}`}>
                                                <a
                                                    className="text-primary underline-offset-2 hover:underline"
                                                    href={`/collections/${ref.collection_id}/items/${ref.item_id}`}
                                                >
                                                    {ref.collection_name} #
                                                    {ref.item_id}
                                                </a>
                                                <span className="text-muted-foreground">
                                                    {' '}
                                                    · {ref.field}
                                                </span>
                                            </li>
                                        ))}
                                        {whereUsedRefs.length > 20 && (
                                            <li className="text-muted-foreground">
                                                {t('files.detail.moreRefs', {
                                                    count:
                                                        whereUsedRefs.length -
                                                        20,
                                                })}
                                            </li>
                                        )}
                                    </ul>
                                )}
                        </div>
                        <Separator />
                    </>
                )}

                <div className="space-y-3">
                    <SectionHeading icon={ImageIcon}>
                        {t('files.detail.focalPoint')}
                    </SectionHeading>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="focal-x">X</Label>
                            <Input
                                id="focal-x"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min={0}
                                max={1}
                                value={focalX}
                                disabled={!canUpdateMetadata}
                                className={numberInputClassName}
                                onChange={(event) =>
                                    setFocalX(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="focal-y">Y</Label>
                            <Input
                                id="focal-y"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min={0}
                                max={1}
                                value={focalY}
                                disabled={!canUpdateMetadata}
                                className={numberInputClassName}
                                onChange={(event) =>
                                    setFocalY(event.target.value)
                                }
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="space-y-3">
                    <SectionHeading icon={FileText}>
                        {t('files.detail.fileNaming')}
                    </SectionHeading>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>{t('files.detail.diskName')}</Label>
                            <Input
                                value={file.name}
                                disabled
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="download-name">
                                {t('files.detail.downloadName')}
                            </Label>
                            <Input
                                id="download-name"
                                value={downloadName}
                                disabled={!canUpdateMetadata}
                                onChange={(event) =>
                                    setDownloadName(event.target.value)
                                }
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="space-y-3">
                    <SectionHeading icon={Scaling}>
                        {t('files.detail.transforms')}
                    </SectionHeading>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="translate-x"
                                className="flex items-center gap-1.5"
                            >
                                <MoveHorizontal className="size-3.5" />
                                {t('files.detail.translateX')}
                            </Label>
                            <Input
                                id="translate-x"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={translateX}
                                disabled={!canUpdateMetadata}
                                className={numberInputClassName}
                                onChange={(event) =>
                                    setTranslateX(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="translate-y"
                                className="flex items-center gap-1.5"
                            >
                                <MoveVertical className="size-3.5" />
                                {t('files.detail.translateY')}
                            </Label>
                            <Input
                                id="translate-y"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={translateY}
                                disabled={!canUpdateMetadata}
                                className={numberInputClassName}
                                onChange={(event) =>
                                    setTranslateY(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="file-scale"
                                className="flex items-center gap-1.5"
                            >
                                <Scaling className="size-3.5" />
                                {t('files.detail.scale')}
                            </Label>
                            <Input
                                id="file-scale"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min={0}
                                value={scale}
                                disabled={!canUpdateMetadata}
                                className={numberInputClassName}
                                onChange={(event) =>
                                    setScale(event.target.value)
                                }
                            />
                        </div>
                    </div>
                </div>
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
