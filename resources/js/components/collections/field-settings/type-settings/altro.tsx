import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    parseHashFieldSettings
    
} from '@/lib/collection-field-types';
import type {SliderFieldSettings} from '@/lib/collection-field-types';

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
                    A unique hash is generated automatically when an item is
                    saved.
                </p>
                <SettingCheckbox
                    id="hash_masked"
                    name="settings[masked]"
                    label="Mask value before save"
                    description="Hide the generated hash in the editor after saving."
                    defaultChecked={hashSettings.masked}
                />
            </div>
        );
    }

    if (fieldType === 'slider') {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <Label htmlFor="slider_min">Minimum</Label>
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
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="slider_max">Maximum</Label>
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
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="slider_step">Step</Label>
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
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="slider_default">Default value</Label>
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
                    </div>
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

/**
 * Serializes slider field settings for API submission.
 * @returns {*}
 */
export function serializeSliderTypeSettings(
    sliderSettings: SliderFieldSettings,
    showValue: boolean,
): Record<string, unknown> {
    return {
        min: sliderSettings.min,
        max: sliderSettings.max,
        step: sliderSettings.step,
        default_value: sliderSettings.defaultValue,
        show_value: showValue ? '1' : '0',
    };
}
