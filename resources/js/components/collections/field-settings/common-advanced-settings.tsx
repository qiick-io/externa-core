import { useTranslation } from 'react-i18next';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { isLayoutGroupType } from '@/lib/collection-field-groups';
import {
    supportsDefaultValue,
    FIELD_LAYOUT_WIDTH_OPTIONS,
    fieldLayoutWidthLabel,
} from '@/lib/collection-field-types';
import type { CommonFieldSettings } from '@/lib/collection-field-types';
import { scalarToString } from '@/lib/scalar-to-string';

type CommonAdvancedSettingsProps = {
    fieldType: string;
    settings: CommonFieldSettings;
    onChange: (
        updater: (current: CommonFieldSettings) => CommonFieldSettings,
    ) => void;
};

/**
 * Shared advanced settings panel for field types.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CommonAdvancedSettings({
    fieldType,
    settings,
    onChange,
}: CommonAdvancedSettingsProps) {
    const { t } = useTranslation();
    const showDefault = supportsDefaultValue(fieldType);
    const isGroup = isLayoutGroupType(fieldType);

    return (
        <div className="space-y-6">
            {!isGroup && (
                <Field>
                    <FieldLabel htmlFor="field_layout_width">
                        {t('collections.fieldSettings.common.fieldWidth')}
                    </FieldLabel>
                    <FieldDescription>
                        {t('collections.fieldSettings.common.fieldWidthHint')}
                    </FieldDescription>
                    <NativeSelect
                        id="field_layout_width"
                        value={settings.layoutWidth}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                layoutWidth: event.target
                                    .value as typeof current.layoutWidth,
                            }))
                        }
                        className="w-full"
                    >
                        {FIELD_LAYOUT_WIDTH_OPTIONS.map((width) => (
                            <option key={width} value={width}>
                                {fieldLayoutWidthLabel(width, t)}
                            </option>
                        ))}
                    </NativeSelect>
                </Field>
            )}
            {!isGroup && (
                <SettingCheckbox
                    id="field_starts_new_row"
                    label={t('collections.fieldSettings.common.startNewRow')}
                    description={t(
                        'collections.fieldSettings.common.startNewRowHint',
                    )}
                    checked={settings.layoutStartsNewRow}
                    onCheckedChange={(checked) =>
                        onChange((current) => ({
                            ...current,
                            layoutStartsNewRow: checked,
                        }))
                    }
                />
            )}
            <SettingCheckbox
                id="field_required"
                label={t('collections.fieldSettings.common.required')}
                description={t('collections.fieldSettings.common.requiredHint')}
                checked={settings.required}
                onCheckedChange={(checked) =>
                    onChange((current) => ({ ...current, required: checked }))
                }
            />
            <SettingCheckbox
                id="field_readonly"
                label={t('collections.fieldSettings.common.readonly')}
                description={t('collections.fieldSettings.common.readonlyHint')}
                checked={settings.readonly}
                onCheckedChange={(checked) =>
                    onChange((current) => ({ ...current, readonly: checked }))
                }
            />
            <SettingCheckbox
                id="field_hidden_in_form"
                label={t('collections.fieldSettings.common.hiddenInForm')}
                description={t(
                    'collections.fieldSettings.common.hiddenInFormHint',
                )}
                checked={settings.hiddenInForm}
                onCheckedChange={(checked) =>
                    onChange((current) => ({
                        ...current,
                        hiddenInForm: checked,
                    }))
                }
            />
            {showDefault ? (
                <Field>
                    <FieldLabel htmlFor="common_default_value">
                        {t('collections.fieldSettings.common.defaultValue')}
                    </FieldLabel>
                    <FieldDescription>
                        {t('collections.fieldSettings.common.defaultValueHint')}
                    </FieldDescription>
                    <Input
                        id="common_default_value"
                        value={
                            settings.defaultValue === null ||
                            settings.defaultValue === undefined
                                ? ''
                                : scalarToString(settings.defaultValue)
                        }
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                defaultValue: event.target.value,
                            }))
                        }
                        placeholder={t(
                            'collections.fieldSettings.common.defaultValuePlaceholder',
                        )}
                    />
                </Field>
            ) : null}
        </div>
    );
}
