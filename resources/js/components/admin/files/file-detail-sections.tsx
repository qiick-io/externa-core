import { FileText, HardDrive, Link2, Lock, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TagPicker } from '@/components/admin/files/tag-picker';
import type {
    AccessChoice,
    FileDetailForm,
} from '@/components/admin/files/use-file-detail-form';
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
import { Textarea } from '@/components/ui/textarea';
import type { FileWhereUsedReference } from '@/lib/files-api';
import type { AdminFileRow, FileTag } from '@/types/files';

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

type FileDetailMetadataFieldsProps = {
    file: AdminFileRow;
    form: FileDetailForm;
    canUpdateMetadata: boolean;
    canTag: boolean;
    tagCatalog: FileTag[];
};

/**
 * Metadata fields of the file detail panel: visibility, title, description,
 * tags, location, and the read-only storage disk and path.
 * @param {FileDetailMetadataFieldsProps} props - Component props.
 * @returns {JSX.Element}
 */
export function FileDetailMetadataFields({
    file,
    form,
    canUpdateMetadata,
    canTag,
    tagCatalog,
}: FileDetailMetadataFieldsProps) {
    const { t } = useTranslation();

    return (
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
                    value={form.access}
                    disabled={!canUpdateMetadata}
                    onValueChange={(value) =>
                        form.setAccess(value as AccessChoice)
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
                    value={form.title}
                    disabled={!canUpdateMetadata}
                    onChange={(event) => form.setTitle(event.target.value)}
                />
            </Field>
            <Field className="gap-2">
                <FieldLabel htmlFor="file-description">
                    {t('files.detail.descriptionLabel')}
                </FieldLabel>
                <Textarea
                    id="file-description"
                    value={form.description}
                    disabled={!canUpdateMetadata}
                    onChange={(event) =>
                        form.setDescription(event.target.value)
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
                    value={form.tags}
                    onChange={form.setTags}
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
                        value={form.location}
                        disabled={!canUpdateMetadata}
                        onChange={(event) =>
                            form.setLocation(event.target.value)
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
                    <Input id="file-storage" value={file.disk} disabled />
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
    );
}

type FileWhereUsedSectionProps = {
    whereUsedLoading: boolean;
    whereUsedError: string | null;
    whereUsedRefs: FileWhereUsedReference[] | null;
};

/**
 * "Where used" section of the file detail panel: the scan state and up to 20
 * links to the collection items that reference the file.
 * @param {FileWhereUsedSectionProps} props - Scan state from useFileWhereUsed.
 * @returns {JSX.Element}
 */
export function FileWhereUsedSection({
    whereUsedLoading,
    whereUsedError,
    whereUsedRefs,
}: FileWhereUsedSectionProps) {
    const { t } = useTranslation();

    return (
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
                <p className="text-xs text-destructive">{whereUsedError}</p>
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
                                ? t('files.detail.referenceCount', {
                                      count: whereUsedRefs.length,
                                  })
                                : t('files.detail.referenceCountPlural', {
                                      count: whereUsedRefs.length,
                                  })}
                        </p>
                        <ItemGroup
                            className="-mx-1"
                            data-test="file-where-used-list"
                        >
                            {whereUsedRefs.slice(0, 20).map((ref) => (
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
                                                {ref.collection_name}
                                            </span>
                                            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                                                #{ref.item_id}
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
                                    {t('files.detail.moreRefs', {
                                        count: whereUsedRefs.length - 20,
                                    })}
                                </p>
                            )}
                        </ItemGroup>
                    </div>
                )}
        </FieldSet>
    );
}

type FileNamingSectionProps = {
    file: AdminFileRow;
    downloadName: string;
    onDownloadNameChange: (downloadName: string) => void;
    canUpdateMetadata: boolean;
};

/**
 * "File naming" section of the file detail panel: the read-only name on disk
 * and the editable download name.
 * @param {FileNamingSectionProps} props - Component props.
 * @returns {JSX.Element}
 */
export function FileNamingSection({
    file,
    downloadName,
    onDownloadNameChange,
    canUpdateMetadata,
}: FileNamingSectionProps) {
    const { t } = useTranslation();

    return (
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
                            onDownloadNameChange(event.target.value)
                        }
                    />
                </Field>
            </div>
        </FieldSet>
    );
}
