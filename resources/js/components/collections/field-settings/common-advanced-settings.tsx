import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import {
    supportsDefaultValue,
    type CommonFieldSettings,
} from '@/lib/collection-field-types';

type CommonAdvancedSettingsProps = {
    fieldType: string;
    settings: CommonFieldSettings;
    onChange: (
        updater: (current: CommonFieldSettings) => CommonFieldSettings,
    ) => void;
};

export function CommonAdvancedSettings({
    fieldType,
    settings,
    onChange,
}: CommonAdvancedSettingsProps) {
    const showDefault = supportsDefaultValue(fieldType);

    return (
        <div className="space-y-5">
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
