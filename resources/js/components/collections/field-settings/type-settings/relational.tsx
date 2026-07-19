import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    parseFilesFieldSettings,
    parseImageFieldSettings,
    parseM2aFieldSettings,
    parseRelationFieldSettings
    
} from '@/lib/collection-field-types';
import type {RelatedCollectionOption} from '@/lib/collection-field-types';

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
    allowedCollectionIds,
    onAllowedCollectionIdsChange,
}: RelationalSettingsProps) {
    if (fieldType === 'image') {
        const imageSettings = parseImageFieldSettings(settings);

        return (
            <div className="space-y-5">
                <SettingCheckbox
                    id="image_allow_multiple"
                    label="Allow multiple images"
                    description="Let editors upload more than one image in this field."
                    checked={allowMultipleImages}
                    onCheckedChange={onAllowMultipleImagesChange}
                />
                <div className="grid gap-2">
                    <Label>Allowed MIME types (comma-separated)</Label>
                    <Input
                        name="settings[allowed_mime_types]"
                        defaultValue={imageSettings.allowedMimeTypes.join(', ')}
                    />
                </div>
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

    if (fieldType === 'files' || fieldType === 'file') {
        const filesSettings = parseFilesFieldSettings(settings);

        return (
            <div className="grid gap-2">
                <Label>Allowed MIME types (comma-separated)</Label>
                <Input
                    name="settings[allowed_mime_types]"
                    defaultValue={filesSettings.allowedMimeTypes.join(', ')}
                />
            </div>
        );
    }

    if (fieldType === 'm2a') {
        const m2aSettings = parseM2aFieldSettings(settings);

        return (
            <div className="space-y-4">
                <div>
                    <Label>Allowed collections</Label>
                    <div className="mt-2 space-y-2">
                        {relatedCollections.map((relatedCollection) => {
                            const checked = allowedCollectionIds.includes(
                                relatedCollection.id,
                            );

                            return (
                                <label
                                    key={relatedCollection.id}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                            if (event.target.checked) {
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
                                        className="size-4 rounded border"
                                    />
                                    {relatedCollection.name}
                                </label>
                            );
                        })}
                    </div>
                </div>
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
        fieldType === 'many_to_many' ||
        fieldType === 'relation_tree' ||
        fieldType === 'relation' ||
        fieldType === 'relation_many'
    ) {
        const relationSettings = parseRelationFieldSettings(settings);

        return (
            <div className="space-y-4">
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="grid gap-2.5">
                        <Label htmlFor="related_collection_id">
                            Related collection
                        </Label>
                        <select
                            id="related_collection_id"
                            value={relatedCollectionId}
                            onChange={(event) =>
                                onRelatedCollectionIdChange(event.target.value)
                            }
                            className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
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
                        </select>
                    </div>
                    <div className="grid gap-2.5">
                        <Label htmlFor="display_field">Display field</Label>
                        <Input
                            id="display_field"
                            value={displayField}
                            onChange={(event) =>
                                onDisplayFieldChange(event.target.value)
                            }
                            placeholder="title"
                        />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="display_template">Display template</Label>
                    <Input
                        id="display_template"
                        name="settings[display_template]"
                        defaultValue={relationSettings.displayTemplate}
                        placeholder="{{title}} — #{{id}}"
                    />
                    <p className="text-xs text-muted-foreground">
                        Optional. Use {'{{field_name}}'} placeholders; falls back
                        to display field when empty.
                    </p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="relation_filter">Filter (JSON)</Label>
                    <textarea
                        id="relation_filter"
                        name="settings[filter]"
                        className="border-input bg-background min-h-[72px] w-full rounded-md border px-3 py-2 font-mono text-sm shadow-xs"
                        defaultValue={relationSettings.filterJson}
                        placeholder='{"status": "published"}'
                    />
                    <p className="text-xs text-muted-foreground">
                        Optional. Exact-match filter on related collection field
                        values (field name → expected value).
                    </p>
                </div>
                {fieldType === 'one_to_many' ? (
                    <div className="grid gap-2">
                        <Label htmlFor="relation_layout">Layout</Label>
                        <select
                            id="relation_layout"
                            name="settings[layout]"
                            defaultValue={relationSettings.layout}
                            className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
                        >
                            <option value="list">List</option>
                            <option value="table">Table</option>
                        </select>
                    </div>
                ) : null}
                <SettingCheckbox
                    id="relation_allow_duplicates"
                    name="settings[allow_duplicates]"
                    label="Allow duplicate links"
                    description="Allow linking the same related item more than once."
                    defaultChecked={relationSettings.allowDuplicates}
                />
            </div>
        );
    }

    return null;
}
