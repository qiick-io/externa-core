import { useTranslation } from 'react-i18next';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
    parseFilesFieldSettings,
    parseImageFieldSettings,
    parseM2aFieldSettings,
    parseRelationFieldSettings,
} from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';

type RelationalSettingsProps = {
    fieldType: string;
    settings?: Record<string, unknown> | null;
    relatedCollections: RelatedCollectionOption[];
    relatedCollectionId: string;
    displayField: string;
    onRelatedCollectionIdChange: (value: string) => void;
    onDisplayFieldChange: (value: string) => void;
    allowMultipleImages: boolean;
    onAllowMultipleImagesChange: (value: boolean) => void;
    allowMultipleFiles: boolean;
    onAllowMultipleFilesChange: (value: boolean) => void;
    allowedCollectionIds: number[];
    onAllowedCollectionIdsChange: (next: number[]) => void;
};

/**
 * Settings panel for relational collection fields.
 * @returns {JSX.Element}
 */
export function RelationalSettings({
    fieldType,
    settings,
    relatedCollections,
    relatedCollectionId,
    displayField,
    onRelatedCollectionIdChange,
    onDisplayFieldChange,
    allowMultipleImages,
    onAllowMultipleImagesChange,
    allowMultipleFiles,
    onAllowMultipleFilesChange,
    allowedCollectionIds,
    onAllowedCollectionIdsChange,
}: RelationalSettingsProps) {
    const { t } = useTranslation();

    if (fieldType === 'image') {
        const imageSettings = parseImageFieldSettings(settings);

        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="image_allow_multiple"
                    label={t(
                        'collections.fieldSettings.relational.allowMultipleImages',
                    )}
                    description={t(
                        'collections.fieldSettings.relational.allowMultipleImagesHint',
                    )}
                    checked={allowMultipleImages}
                    onCheckedChange={onAllowMultipleImagesChange}
                />
                <Field>
                    <FieldLabel>
                        {t(
                            'collections.fieldSettings.relational.allowedMimeTypes',
                        )}
                    </FieldLabel>
                    <Input
                        name="settings[allowed_mime_types]"
                        defaultValue={imageSettings.allowedMimeTypes.join(', ')}
                    />
                </Field>
                <SettingCheckbox
                    id="image_crop_to_fit"
                    name="settings[crop_to_fit]"
                    label={t('collections.fieldSettings.relational.cropToFit')}
                    description={t(
                        'collections.fieldSettings.relational.cropToFitHint',
                    )}
                    defaultChecked={imageSettings.cropToFit}
                />
            </div>
        );
    }

    if (fieldType === 'files') {
        const filesSettings = parseFilesFieldSettings(settings);

        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="files_allow_multiple"
                    label={t(
                        'collections.fieldSettings.relational.allowMultipleFiles',
                    )}
                    description={t(
                        'collections.fieldSettings.relational.allowMultipleFilesHint',
                    )}
                    checked={allowMultipleFiles}
                    onCheckedChange={onAllowMultipleFilesChange}
                />
                <Field>
                    <FieldLabel>
                        {t(
                            'collections.fieldSettings.relational.allowedMimeTypes',
                        )}
                    </FieldLabel>
                    <Input
                        name="settings[allowed_mime_types]"
                        defaultValue={filesSettings.allowedMimeTypes.join(', ')}
                    />
                </Field>
            </div>
        );
    }

    if (fieldType === 'm2a') {
        const m2aSettings = parseM2aFieldSettings(settings);

        return (
            <div className="space-y-4">
                <FieldSet className="gap-3">
                    <FieldLegend variant="label" className="mb-0">
                        {t(
                            'collections.fieldSettings.relational.allowedCollections',
                        )}
                    </FieldLegend>
                    <div className="space-y-2">
                        {relatedCollections.map((relatedCollection) => {
                            const checked = allowedCollectionIds.includes(
                                relatedCollection.id,
                            );
                            const checkboxId = `m2a_allowed_collection_${relatedCollection.id}`;

                            return (
                                <Field
                                    key={relatedCollection.id}
                                    orientation="horizontal"
                                >
                                    <Checkbox
                                        id={checkboxId}
                                        checked={checked}
                                        onCheckedChange={(isChecked) => {
                                            if (isChecked === true) {
                                                onAllowedCollectionIdsChange([
                                                    ...allowedCollectionIds,
                                                    relatedCollection.id,
                                                ]);

                                                return;
                                            }

                                            onAllowedCollectionIdsChange(
                                                allowedCollectionIds.filter(
                                                    (collectionId) =>
                                                        collectionId !==
                                                        relatedCollection.id,
                                                ),
                                            );
                                        }}
                                    />
                                    <FieldLabel
                                        htmlFor={checkboxId}
                                        className="font-normal"
                                    >
                                        {relatedCollection.name}
                                    </FieldLabel>
                                </Field>
                            );
                        })}
                    </div>
                </FieldSet>
                <SettingCheckbox
                    id="m2a_allow_duplicates"
                    name="settings[allow_duplicates]"
                    label={t(
                        'collections.fieldSettings.relational.allowDuplicateBlocks',
                    )}
                    description={t(
                        'collections.fieldSettings.relational.allowDuplicateBlocksHint',
                    )}
                    defaultChecked={m2aSettings.allowDuplicates}
                />
            </div>
        );
    }

    if (
        fieldType === 'many_to_one' ||
        fieldType === 'one_to_many' ||
        fieldType === 'many_to_many'
    ) {
        const relationSettings = parseRelationFieldSettings(settings);

        return (
            <div className="space-y-4">
                <div className="grid gap-6 sm:grid-cols-2">
                    <Field>
                        <FieldLabel htmlFor="related_collection_id">
                            {t(
                                'collections.fieldSettings.relational.relatedCollection',
                            )}
                        </FieldLabel>
                        <NativeSelect
                            id="related_collection_id"
                            value={relatedCollectionId}
                            onChange={(event) =>
                                onRelatedCollectionIdChange(event.target.value)
                            }
                            className="w-full"
                        >
                            <option value="">
                                {t(
                                    'collections.fieldSettings.relational.selectCollection',
                                )}
                            </option>
                            {relatedCollections.map((relatedCollection) => (
                                <option
                                    key={relatedCollection.id}
                                    value={String(relatedCollection.id)}
                                >
                                    {relatedCollection.name}
                                </option>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="display_field">
                            {t(
                                'collections.fieldSettings.relational.displayField',
                            )}
                        </FieldLabel>
                        <Input
                            id="display_field"
                            value={displayField}
                            onChange={(event) =>
                                onDisplayFieldChange(event.target.value)
                            }
                            placeholder="title"
                        />
                    </Field>
                </div>
                <Field>
                    <FieldLabel htmlFor="display_template">
                        {t(
                            'collections.fieldSettings.relational.displayTemplate',
                        )}
                    </FieldLabel>
                    <Input
                        id="display_template"
                        name="settings[display_template]"
                        defaultValue={relationSettings.displayTemplate}
                        placeholder="{{title}} — #{{id}}"
                    />
                    <FieldDescription>
                        {t(
                            'collections.fieldSettings.relational.displayTemplateHint',
                            {
                                placeholder: '{{field_name}}',
                            },
                        )}
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel htmlFor="relation_filter">
                        {t('collections.fieldSettings.relational.filterJson')}
                    </FieldLabel>
                    <Textarea
                        id="relation_filter"
                        name="settings[filter]"
                        className="min-h-18 font-mono"
                        defaultValue={relationSettings.filterJson}
                        placeholder='{"status": "published"}'
                    />
                    <FieldDescription>
                        {t(
                            'collections.fieldSettings.relational.filterJsonHint',
                        )}
                    </FieldDescription>
                </Field>
                {fieldType === 'one_to_many' ? (
                    <Field>
                        <FieldLabel htmlFor="relation_layout">
                            {t('collections.fieldSettings.relational.layout')}
                        </FieldLabel>
                        <NativeSelect
                            id="relation_layout"
                            name="settings[layout]"
                            defaultValue={relationSettings.layout}
                            className="w-full"
                        >
                            <option value="list">
                                {t(
                                    'collections.fieldSettings.relational.layoutList',
                                )}
                            </option>
                            <option value="table">
                                {t(
                                    'collections.fieldSettings.relational.layoutTable',
                                )}
                            </option>
                        </NativeSelect>
                    </Field>
                ) : null}
                <SettingCheckbox
                    id="relation_allow_duplicates"
                    name="settings[allow_duplicates]"
                    label={t(
                        'collections.fieldSettings.relational.allowDuplicateLinks',
                    )}
                    description={t(
                        'collections.fieldSettings.relational.allowDuplicateLinksHint',
                    )}
                    defaultChecked={relationSettings.allowDuplicates}
                />
                {fieldType === 'many_to_many' ? (
                    <Field>
                        <FieldLabel htmlFor="junction_fields">
                            {t(
                                'collections.fieldSettings.relational.junctionFields',
                            )}
                        </FieldLabel>
                        <Textarea
                            id="junction_fields"
                            name="settings[junction_fields]"
                            className="min-h-22 font-mono"
                            defaultValue={relationSettings.junctionFieldsJson}
                            placeholder='[{"name":"sort","type":"number"}]'
                        />
                        <FieldDescription>
                            {t(
                                'collections.fieldSettings.relational.junctionFieldsHint',
                            )}
                        </FieldDescription>
                    </Field>
                ) : null}
            </div>
        );
    }

    return null;
}
