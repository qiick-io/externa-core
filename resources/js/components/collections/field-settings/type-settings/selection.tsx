import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
    parseBooleanFieldSettings,
    parseColorFieldSettings,
    parseMapFieldSettings,
    parseSelectFieldSettings,
} from '@/lib/collection-field-types';
import type { TranslatedText } from '@/lib/collection-field-types';

type SelectionSettingsProps = {
    fieldType: string;
    settings?: Record<string, unknown> | null;
    booleanLabels: { labelOn: TranslatedText; labelOff: TranslatedText };
    onBooleanLabelsChange: (next: {
        labelOn: TranslatedText;
        labelOff: TranslatedText;
    }) => void;
};

/**
 * Settings panel for select and boolean field types.
 * @returns {JSX.Element}
 */
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
        const dateMode = String(settings?.date_mode ?? 'datetime');

        return (
            <div className="space-y-6">
                <Field>
                    <FieldLabel htmlFor="date_mode">Mode</FieldLabel>
                    <NativeSelect
                        id="date_mode"
                        name="settings[date_mode]"
                        defaultValue={
                            dateMode === 'date' || dateMode === 'time'
                                ? dateMode
                                : 'datetime'
                        }
                        className="w-full"
                    >
                        <option value="date">Date only</option>
                        <option value="time">Time only</option>
                        <option value="datetime">Date and time</option>
                    </NativeSelect>
                </Field>
                <SettingCheckbox
                    id="date_include_seconds"
                    name="settings[include_seconds]"
                    label="Include seconds"
                    description="Allow time values with seconds precision (time / datetime modes)."
                    defaultChecked={
                        settings?.include_seconds === true ||
                        settings?.include_seconds === '1'
                    }
                />
            </div>
        );
    }

    if (fieldType === 'map') {
        const mapSettings = parseMapFieldSettings(settings);

        return (
            <div className="space-y-4">
                <Field>
                    <FieldLabel htmlFor="geometry_mode">
                        Geometry mode
                    </FieldLabel>
                    <NativeSelect
                        id="geometry_mode"
                        name="settings[geometry_mode]"
                        defaultValue={mapSettings.geometryMode}
                        className="w-full"
                    >
                        <option value="point">Point</option>
                        <option value="multipoint">MultiPoint</option>
                    </NativeSelect>
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                        <FieldLabel>Default latitude</FieldLabel>
                        <Input
                            type="number"
                            step="any"
                            name="settings[default_lat]"
                            defaultValue={mapSettings.defaultLat ?? ''}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>Default longitude</FieldLabel>
                        <Input
                            type="number"
                            step="any"
                            name="settings[default_lng]"
                            defaultValue={mapSettings.defaultLng ?? ''}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>Default zoom</FieldLabel>
                        <Input
                            type="number"
                            name="settings[default_zoom]"
                            defaultValue={mapSettings.defaultZoom}
                        />
                    </Field>
                </div>
            </div>
        );
    }

    if (fieldType === 'color') {
        const colorSettings = parseColorFieldSettings(settings);

        return (
            <div className="space-y-6">
                <SettingCheckbox
                    id="color_opacity"
                    name="settings[opacity]"
                    label="Enable opacity"
                    description="Allow adjusting the alpha channel in the color picker."
                    defaultChecked={colorSettings.opacity}
                />
                <Field>
                    <FieldLabel>Preset colors (comma-separated hex)</FieldLabel>
                    <Input
                        name="settings[preset_colors]"
                        defaultValue={colorSettings.presetColors.join(', ')}
                    />
                </Field>
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
            <div className="space-y-6">
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
            <Field>
                <FieldLabel htmlFor="value_combining">
                    Value combining
                </FieldLabel>
                <NativeSelect
                    id="value_combining"
                    name="settings[value_combining]"
                    defaultValue={String(settings?.value_combining ?? 'all')}
                    className="w-full"
                >
                    <option value="all">All selected nodes</option>
                    <option value="leaf">Leaf nodes only</option>
                </NativeSelect>
            </Field>
        );
    }

    return null;
}

/**
 * Serializes boolean field label settings.
 * @returns {*}
 */
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
