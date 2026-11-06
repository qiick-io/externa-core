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
    if (fieldType === 'image') {
        const imageSettings = parseImageFieldSettings(settings);

        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="image_allow_multiple"
                    label="Allow multiple images"
                    description="Let editors upload more than one image in this field."
                    checked={allowMultipleImages}
                    onCheckedChange={onAllowMultipleImagesChange}
                />
                <Field>
                    <FieldLabel>
                        Allowed MIME types (comma-separated)
                    </FieldLabel>
                    <Input
                        name="settings[allowed_mime_types]"
                        defaultValue={imageSettings.allowedMimeTypes.join(', ')}
                    />
                </Field>
                <SettingCheckbox
                    id="image_crop_to_fit"
                    name="settings[crop_to_fit]"
                    label="Crop to fit"
                    description="Crop uploaded images to fit the configured aspect ratio."
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
                    label="Allow multiple files"
                    description="Let editors attach more than one file in this field."
                    checked={allowMultipleFiles}
                    onCheckedChange={onAllowMultipleFilesChange}
                />
                <Field>
                    <FieldLabel>
                        Allowed MIME types (comma-separated)
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
                        Allowed collections
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
                    label="Allow duplicate blocks"
                    description="Allow adding the same collection block more than once."
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
                            Related collection
                        </FieldLabel>
                        <NativeSelect
                            id="related_collection_id"
                            value={relatedCollectionId}
                            onChange={(event) =>
                                onRelatedCollectionIdChange(event.target.value)
                            }
                            className="w-full"
                        >
                            <option value="">Select a collection…</option>
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
                            Display field
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
                        Display template
                    </FieldLabel>
                    <Input
                        id="display_template"
                        name="settings[display_template]"
                        defaultValue={relationSettings.displayTemplate}
                        placeholder="{{title}} — #{{id}}"
                    />
                    <FieldDescription>
                        Optional. Use {'{{field_name}}'} placeholders; falls
                        back to display field when empty.
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel htmlFor="relation_filter">
                        Filter (JSON)
                    </FieldLabel>
                    <textarea
                        id="relation_filter"
                        name="settings[filter]"
                        className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-xs"
                        defaultValue={relationSettings.filterJson}
                        placeholder='{"status": "published"}'
                    />
                    <FieldDescription>
                        Optional. Exact-match filter on related collection field
                        values (field name → expected value).
                    </FieldDescription>
                </Field>
                {fieldType === 'one_to_many' ? (
                    <Field>
                        <FieldLabel htmlFor="relation_layout">
                            Layout
                        </FieldLabel>
                        <NativeSelect
                            id="relation_layout"
                            name="settings[layout]"
                            defaultValue={relationSettings.layout}
                            className="w-full"
                        >
                            <option value="list">List</option>
                            <option value="table">Table</option>
                        </NativeSelect>
                    </Field>
                ) : null}
                <SettingCheckbox
                    id="relation_allow_duplicates"
                    name="settings[allow_duplicates]"
                    label="Allow duplicate links"
                    description="Allow linking the same related item more than once."
                    defaultChecked={relationSettings.allowDuplicates}
                />
                {fieldType === 'many_to_many' ? (
                    <Field>
                        <FieldLabel htmlFor="junction_fields">
                            Junction fields (JSON)
                        </FieldLabel>
                        <textarea
                            id="junction_fields"
                            name="settings[junction_fields]"
                            className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-xs"
                            defaultValue={relationSettings.junctionFieldsJson}
                            placeholder='[{"name":"sort","type":"number"}]'
                        />
                        <FieldDescription>
                            Optional mini-schema for per-link metadata. Item
                            forms show these fields next to each related item.
                            Types: string, number, boolean.
                        </FieldDescription>
                    </Field>
                ) : null}
            </div>
        );
    }

    return null;
}
