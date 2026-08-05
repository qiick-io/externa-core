import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    supportsDefaultValue,
    FIELD_LAYOUT_WIDTH_OPTIONS,
} from '@/lib/collection-field-types';
import type { CommonFieldSettings } from '@/lib/collection-field-types';

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
    const showDefault = supportsDefaultValue(fieldType);

    return (
        <div className="space-y-5">
            <div className="grid gap-2">
                <Label htmlFor="field_layout_width">Field width</Label>
                <p className="text-sm text-muted-foreground">
                    How much horizontal space this field takes in the form.
                </p>
                <select
                    id="field_layout_width"
                    value={settings.layoutWidth}
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            layoutWidth: event.target.value as typeof current.layoutWidth,
                        }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                    {FIELD_LAYOUT_WIDTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <SettingCheckbox
                id="field_starts_new_row"
                label="Start new row"
                description="Force this field to begin on a new row in the form layout."
                checked={settings.layoutStartsNewRow}
                onCheckedChange={(checked) =>
                    onChange((current) => ({
                        ...current,
                        layoutStartsNewRow: checked,
                    }))
                }
            />
            <SettingCheckbox
                id="field_required"
                label="Required"
                description="Content cannot be saved until this field has a value."
                checked={settings.required}
                onCheckedChange={(checked) =>
                    onChange((current) => ({ ...current, required: checked }))
                }
            />
            <SettingCheckbox
                id="field_readonly"
                label="Readonly"
                description="Editors can see the value but cannot change it after the first save."
                checked={settings.readonly}
                onCheckedChange={(checked) =>
                    onChange((current) => ({ ...current, readonly: checked }))
                }
            />
            <SettingCheckbox
                id="field_hidden_in_form"
                label="Hidden in form"
                description="Hide this field from the item editor while keeping it in the schema."
                checked={settings.hiddenInForm}
                onCheckedChange={(checked) =>
                    onChange((current) => ({
                        ...current,
                        hiddenInForm: checked,
                    }))
                }
            />
            {showDefault ? (
                <div className="grid gap-2">
                    <Label htmlFor="common_default_value">Default value</Label>
                    <p className="text-sm text-muted-foreground">
                        Applied when creating a new item if the field is left
                        empty.
                    </p>
                    <Input
                        id="common_default_value"
                        value={
                            settings.defaultValue === null ||
                            settings.defaultValue === undefined
                                ? ''
                                : String(settings.defaultValue)
                        }
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                defaultValue: event.target.value,
                            }))
                        }
                        placeholder="Applied on create when empty"
                    />
                </div>
            ) : null}
        </div>
    );
}
