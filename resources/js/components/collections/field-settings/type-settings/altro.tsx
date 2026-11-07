import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { parseHashFieldSettings } from '@/lib/collection-field-types';
import type { SliderFieldSettings } from '@/lib/collection-field-types';

type AltroSettingsProps = {
    fieldType: string;
    settings?: Record<string, unknown> | null;
    sliderSettings: SliderFieldSettings;
    onSliderSettingsChange: (
        updater: (current: SliderFieldSettings) => SliderFieldSettings,
    ) => void;
    sliderShowValue: boolean;
    onSliderShowValueChange: (value: boolean) => void;
};

/**
 * Settings panel for miscellaneous field types (slider, etc.).
 * @returns {JSX.Element}
 */
export function AltroSettings({
    fieldType,
    settings,
    sliderSettings,
    onSliderSettingsChange,
    sliderShowValue,
    onSliderShowValueChange,
}: AltroSettingsProps) {
    if (fieldType === 'hash') {
        const hashSettings = parseHashFieldSettings(settings);

        return (
            <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Stores an auto-generated fingerprint ID (`sha256` of a UUID)
                    when empty on save. This is <strong>not</strong> a password
                    hash — values are identifiers, not secrets derived from user
                    input.
                </p>
                <SettingCheckbox
                    id="hash_masked"
                    name="settings[masked]"
                    label="Mask value in editor"
                    description="Show only a short prefix of the fingerprint after save."
                    defaultChecked={hashSettings.masked}
                />
            </div>
        );
    }

    if (fieldType === 'slider') {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel htmlFor="slider_min">Minimum</FieldLabel>
                        <Input
                            id="slider_min"
                            type="number"
                            step="any"
                            value={sliderSettings.min}
                            onChange={(event) =>
                                onSliderSettingsChange((current) => ({
                                    ...current,
                                    min: Number(event.target.value),
                                }))
                            }
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="slider_max">Maximum</FieldLabel>
                        <Input
                            id="slider_max"
                            type="number"
                            step="any"
                            value={sliderSettings.max}
                            onChange={(event) =>
                                onSliderSettingsChange((current) => ({
                                    ...current,
                                    max: Number(event.target.value),
                                }))
                            }
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="slider_step">Step</FieldLabel>
                        <Input
                            id="slider_step"
                            type="number"
                            step="any"
                            min="0"
                            value={sliderSettings.step}
                            onChange={(event) =>
                                onSliderSettingsChange((current) => ({
                                    ...current,
                                    step: Number(event.target.value),
                                }))
                            }
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="slider_default">
                            Default value
                        </FieldLabel>
                        <Input
                            id="slider_default"
                            type="number"
                            step="any"
                            value={sliderSettings.defaultValue}
                            onChange={(event) =>
                                onSliderSettingsChange((current) => ({
                                    ...current,
                                    defaultValue: Number(event.target.value),
                                }))
                            }
                        />
                    </Field>
                </div>
                <SettingCheckbox
                    id="slider_show_value"
                    label="Show current value"
                    description="Display the numeric value next to the slider control."
                    checked={sliderShowValue}
                    onCheckedChange={onSliderShowValueChange}
                />
            </div>
        );
    }

    return null;
}
