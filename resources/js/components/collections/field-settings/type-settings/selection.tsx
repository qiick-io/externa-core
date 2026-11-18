import { useTranslation } from 'react-i18next';
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
import { scalarToString } from '@/lib/scalar-to-string';

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
    const { t } = useTranslation();

    if (fieldType === 'boolean') {
        return (
            <div className="space-y-6">
                <TranslatedInput
                    idPrefix="label_on"
                    label={t('collections.fieldSettings.selection.labelOn')}
                    value={booleanLabels.labelOn}
                    onChange={(labelOn) =>
                        onBooleanLabelsChange({ ...booleanLabels, labelOn })
                    }
                />
                <TranslatedInput
                    idPrefix="label_off"
                    label={t('collections.fieldSettings.selection.labelOff')}
                    value={booleanLabels.labelOff}
                    onChange={(labelOff) =>
                        onBooleanLabelsChange({ ...booleanLabels, labelOff })
                    }
                />
            </div>
        );
    }

    if (fieldType === 'date') {
        const dateMode = scalarToString(settings?.date_mode, 'datetime');

        return (
            <div className="space-y-6">
                <Field>
                    <FieldLabel htmlFor="date_mode">
                        {t('collections.fieldSettings.selection.dateMode')}
                    </FieldLabel>
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
                        <option value="date">
                            {t('collections.fieldSettings.selection.dateOnly')}
                        </option>
                        <option value="time">
                            {t('collections.fieldSettings.selection.timeOnly')}
                        </option>
                        <option value="datetime">
                            {t(
                                'collections.fieldSettings.selection.dateAndTime',
                            )}
                        </option>
                    </NativeSelect>
                </Field>
                <SettingCheckbox
                    id="date_include_seconds"
                    name="settings[include_seconds]"
                    label={t(
                        'collections.fieldSettings.selection.includeSeconds',
                    )}
                    description={t(
                        'collections.fieldSettings.selection.includeSecondsHint',
                    )}
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
                        {t('collections.fieldSettings.selection.geometryMode')}
                    </FieldLabel>
                    <NativeSelect
                        id="geometry_mode"
                        name="settings[geometry_mode]"
                        defaultValue={mapSettings.geometryMode}
                        className="w-full"
                    >
                        <option value="point">
                            {t('collections.fieldSettings.selection.point')}
                        </option>
                        <option value="multipoint">
                            {t(
                                'collections.fieldSettings.selection.multiPoint',
                            )}
                        </option>
                    </NativeSelect>
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                        <FieldLabel>
                            {t(
                                'collections.fieldSettings.selection.defaultLatitude',
                            )}
                        </FieldLabel>
                        <Input
                            type="number"
                            step="any"
                            name="settings[default_lat]"
                            defaultValue={mapSettings.defaultLat ?? ''}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>
                            {t(
                                'collections.fieldSettings.selection.defaultLongitude',
                            )}
                        </FieldLabel>
                        <Input
                            type="number"
                            step="any"
                            name="settings[default_lng]"
                            defaultValue={mapSettings.defaultLng ?? ''}
                        />
                    </Field>
                    <Field>
                        <FieldLabel>
                            {t(
                                'collections.fieldSettings.selection.defaultZoom',
                            )}
                        </FieldLabel>
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
                    label={t(
                        'collections.fieldSettings.selection.enableOpacity',
                    )}
                    description={t(
                        'collections.fieldSettings.selection.enableOpacityHint',
                    )}
                    defaultChecked={colorSettings.opacity}
                />
                <Field>
                    <FieldLabel>
                        {t('collections.fieldSettings.selection.presetColors')}
                    </FieldLabel>
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
                        label={t(
                            'collections.fieldSettings.selection.allowNone',
                        )}
                        description={t(
                            'collections.fieldSettings.selection.allowNoneHint',
                        )}
                        defaultChecked={selectSettings.allowNone}
                    />
                ) : null}
                <SettingCheckbox
                    id="select_allow_other"
                    name="settings[allow_other]"
                    label={t('collections.fieldSettings.selection.allowOther')}
                    description={t(
                        'collections.fieldSettings.selection.allowOtherHint',
                    )}
                    defaultChecked={selectSettings.allowOther}
                />
            </div>
        );
    }

    if (fieldType === 'checkbox_group_tree') {
        return (
            <Field>
                <FieldLabel htmlFor="value_combining">
                    {t('collections.fieldSettings.selection.valueCombining')}
                </FieldLabel>
                <NativeSelect
                    id="value_combining"
                    name="settings[value_combining]"
                    defaultValue={scalarToString(
                        settings?.value_combining,
                        'all',
                    )}
                    className="w-full"
                >
                    <option value="all">
                        {t(
                            'collections.fieldSettings.selection.allSelectedNodes',
                        )}
                    </option>
                    <option value="leaf">
                        {t('collections.fieldSettings.selection.leafNodesOnly')}
                    </option>
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
