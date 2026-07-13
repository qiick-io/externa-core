import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import {
    parseBooleanFieldSettings,
    parseColorFieldSettings,
    parseMapFieldSettings,
    parseSelectFieldSettings,
    type TranslatedText,
} from '@/lib/collection-field-types';

type SelectionSettingsProps = {
    fieldType: string;
    settings?: Record<string, unknown> | null;
    booleanLabels: { labelOn: TranslatedText; labelOff: TranslatedText };
    onBooleanLabelsChange: (next: {
        labelOn: TranslatedText;
        labelOff: TranslatedText;
    }) => void;
};

export function SelectionSettings({
    fieldType,
    settings,
    booleanLabels,
    onBooleanLabelsChange,
}: SelectionSettingsProps) {
    if (fieldType === 'boolean') {
        return (
            <div className="space-y-6">
                <TranslatedInput
                    idPrefix="label_on"
                    label="Label when on"
                    value={booleanLabels.labelOn}
                    onChange={(labelOn) =>
                        onBooleanLabelsChange({ ...booleanLabels, labelOn })
                    }
                />
                <TranslatedInput
                    idPrefix="label_off"
                    label="Label when off"
                    value={booleanLabels.labelOff}
                    onChange={(labelOff) =>
                        onBooleanLabelsChange({ ...booleanLabels, labelOff })
                    }
                />
            </div>
        );
    }

    if (fieldType === 'date') {
        return (
            <div className="space-y-5">
                <SettingCheckbox
                    id="date_include_seconds"
                    name="settings[include_seconds]"
                    label="Include seconds"
                    description="Allow time values with seconds precision."
                    defaultChecked={
                        settings?.include_seconds === true ||
                        settings?.include_seconds === '1'
                    }
                />
                <SettingCheckbox
                    id="date_use_24h"
                    name="settings[use_24h]"
                    label="Use 24h format"
                    description="Display and edit times in 24-hour format instead of AM/PM."
                    defaultChecked={
                        settings?.use_24h === true ||
                        settings?.use_24h === '1' ||
                        settings?.use_24h === undefined
                    }
                />
            </div>
        );
    }

    if (fieldType === 'map') {
        const mapSettings = parseMapFieldSettings(settings);

        return (
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                    <Label>Default latitude</Label>
                    <Input
                        type="number"
                        step="any"
                        name="settings[default_lat]"
                        defaultValue={mapSettings.defaultLat ?? ''}
                    />
                </div>
                <div className="grid gap-2">
                    <Label>Default longitude</Label>
                    <Input
                        type="number"
                        step="any"
                        name="settings[default_lng]"
                        defaultValue={mapSettings.defaultLng ?? ''}
                    />
                </div>
                <div className="grid gap-2">
                    <Label>Default zoom</Label>
                    <Input
                        type="number"
                        name="settings[default_zoom]"
                        defaultValue={mapSettings.defaultZoom}
                    />
                </div>
            </div>
        );
    }

    if (fieldType === 'color') {
        const colorSettings = parseColorFieldSettings(settings);

        return (
            <div className="space-y-5">
                <SettingCheckbox
                    id="color_opacity"
                    name="settings[opacity]"
                    label="Enable opacity"
                    description="Allow adjusting the alpha channel in the color picker."
                    defaultChecked={colorSettings.opacity}
                />
                <div className="grid gap-2">
                    <Label>Preset colors (comma-separated hex)</Label>
                    <Input
                        name="settings[preset_colors]"
                        defaultValue={colorSettings.presetColors.join(', ')}
                    />
                </div>
            </div>
        );
    }

    if (
        fieldType === 'select' ||
        fieldType === 'multiselect' ||
        fieldType === 'radio_group' ||
        fieldType === 'checkbox_group' ||
        fieldType === 'autocomplete'
    ) {
        const selectSettings = parseSelectFieldSettings(settings);

        return (
            <div className="space-y-5">
                {fieldType === 'select' ? (
                    <SettingCheckbox
                        id="select_allow_none"
                        name="settings[allow_none]"
                        label="Allow empty selection"
                        description="Let editors clear the selection without choosing an option."
                        defaultChecked={selectSettings.allowNone}
                    />
                ) : null}
                <SettingCheckbox
                    id="select_allow_other"
                    name="settings[allow_other]"
                    label="Allow values outside options"
                    description="Accept custom values not listed in the choices."
                    defaultChecked={selectSettings.allowOther}
                />
            </div>
        );
    }

    if (fieldType === 'checkbox_group_tree') {
        return (
            <div className="grid gap-2">
                <Label htmlFor="value_combining">Value combining</Label>
                <select
                    id="value_combining"
                    name="settings[value_combining]"
                    defaultValue={String(settings?.value_combining ?? 'all')}
                    className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
                >
                    <option value="all">All selected nodes</option>
                    <option value="leaf">Leaf nodes only</option>
                </select>
            </div>
        );
    }

    return null;
}

export function serializeBooleanFieldSettings(booleanLabels: {
    labelOn: TranslatedText;
    labelOff: TranslatedText;
}): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (booleanLabels.labelOn.en || booleanLabels.labelOn.it) {
        out.label_on = booleanLabels.labelOn;
    }

    if (booleanLabels.labelOff.en || booleanLabels.labelOff.it) {
        out.label_off = booleanLabels.labelOff;
    }

    return out;
}

export { parseBooleanFieldSettings };
