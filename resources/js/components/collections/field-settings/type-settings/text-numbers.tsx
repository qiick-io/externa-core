import { LucideIconPicker } from '@/components/collections/field-settings/lucide-icon-picker';
import { SettingCheckbox } from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
    STRING_INPUT_TYPES,
    parseApiAutocompleteFieldSettings,
    parseCodeFieldSettings,
    parseNumberFieldSettings,
    parseSelectFieldSettings,
    parseStringFieldSettings,
    parseTagFieldSettings,
    parseTextareaFieldSettings,
    serializeApiAutocompleteFieldSettings,
    serializeStringFieldSettings,
} from '@/lib/collection-field-types';
import type {
    ApiAutocompleteFieldSettings,
    StringFieldSettings,
} from '@/lib/collection-field-types';

type TextNumbersSettingsProps = {
    fieldType: string;
    settings?: Record<string, unknown> | null;
    stringSettings: StringFieldSettings;
    onStringSettingsChange: (
        updater: (current: StringFieldSettings) => StringFieldSettings,
    ) => void;
    apiAutocompleteSettings?: ApiAutocompleteFieldSettings;
    onApiAutocompleteSettingsChange?: (
        updater: (
            current: ApiAutocompleteFieldSettings,
        ) => ApiAutocompleteFieldSettings,
    ) => void;
};

/**
 * Settings panel for text and numeric field types.
 * @returns {JSX.Element}
 */
export function TextNumbersSettings({
    fieldType,
    settings,
    stringSettings,
    onStringSettingsChange,
    apiAutocompleteSettings,
    onApiAutocompleteSettingsChange,
}: TextNumbersSettingsProps) {
    if (fieldType === 'string') {
        return (
            <div className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                    <Field>
                        <FieldLabel htmlFor="input_type">Input type</FieldLabel>
                        <NativeSelect
                            id="input_type"
                            value={stringSettings.inputType}
                            onChange={(event) =>
                                onStringSettingsChange((current) => ({
                                    ...current,
                                    inputType: event.target.value,
                                }))
                            }
                            className="w-full"
                        >
                            {STRING_INPUT_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="string_max_length">
                            Max length
                        </FieldLabel>
                        <Input
                            id="string_max_length"
                            type="number"
                            min={1}
                            value={stringSettings.maxLength ?? ''}
                            onChange={(event) =>
                                onStringSettingsChange((current) => ({
                                    ...current,
                                    maxLength:
                                        event.target.value === ''
                                            ? null
                                            : Number(event.target.value),
                                }))
                            }
                        />
                    </Field>
                </div>
                <TranslatedInput
                    idPrefix="string_placeholder"
                    label="Placeholder"
                    value={stringSettings.placeholder}
                    onChange={(placeholder) =>
                        onStringSettingsChange((current) => ({
                            ...current,
                            placeholder,
                        }))
                    }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <LucideIconPicker
                        id="icon_left"
                        label="Icon left"
                        value={stringSettings.iconLeft}
                        onChange={(iconLeft) =>
                            onStringSettingsChange((current) => ({
                                ...current,
                                iconLeft,
                            }))
                        }
                    />
                    <LucideIconPicker
                        id="icon_right"
                        label="Icon right"
                        value={stringSettings.iconRight}
                        onChange={(iconRight) =>
                            onStringSettingsChange((current) => ({
                                ...current,
                                iconRight,
                            }))
                        }
                    />
                </div>
                <div className="space-y-6">
                    <SettingCheckbox
                        id="string_trim"
                        label="Trim whitespace"
                        description="Remove leading and trailing spaces when saving."
                        checked={stringSettings.trim}
                        onCheckedChange={(trim) =>
                            onStringSettingsChange((current) => ({
                                ...current,
                                trim,
                            }))
                        }
                    />
                    <SettingCheckbox
                        id="string_slugify"
                        label="Slugify"
                        description="Convert the value to a URL-friendly slug on save."
                        checked={stringSettings.slugify}
                        onCheckedChange={(slugify) =>
                            onStringSettingsChange((current) => ({
                                ...current,
                                slugify,
                            }))
                        }
                    />
                    <SettingCheckbox
                        id="string_masked"
                        label="Masked (password)"
                        description="Hide input characters like a password field."
                        checked={stringSettings.masked}
                        onCheckedChange={(masked) =>
                            onStringSettingsChange((current) => ({
                                ...current,
                                masked,
                            }))
                        }
                    />
                </div>
            </div>
        );
    }

    if (
        fieldType === 'textarea' ||
        fieldType === 'wysiwyg' ||
        fieldType === 'markdown'
    ) {
        return (
            <TextareaLikeSettingsPanel
                fieldType={fieldType}
                settings={settings}
            />
        );
    }

    if (fieldType === 'number') {
        const numberSettings = parseNumberFieldSettings(settings);

        return (
            <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel>Min</FieldLabel>
                    <Input
                        type="number"
                        step="any"
                        defaultValue={numberSettings.min ?? ''}
                        name="settings[min]"
                    />
                </Field>
                <Field>
                    <FieldLabel>Max</FieldLabel>
                    <Input
                        type="number"
                        step="any"
                        defaultValue={numberSettings.max ?? ''}
                        name="settings[max]"
                    />
                </Field>
                <Field>
                    <FieldLabel>Step</FieldLabel>
                    <Input
                        type="number"
                        step="any"
                        defaultValue={numberSettings.step ?? ''}
                        name="settings[step]"
                    />
                </Field>
            </div>
        );
    }

    if (fieldType === 'code') {
        const codeSettings = parseCodeFieldSettings(settings);

        return (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel htmlFor="code_language">
                            Language
                        </FieldLabel>
                        <Input
                            id="code_language"
                            name="settings[language]"
                            defaultValue={codeSettings.language}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="code_template">
                            Template
                        </FieldLabel>
                        <Input
                            id="code_template"
                            name="settings[template]"
                            defaultValue={codeSettings.template}
                        />
                    </Field>
                </div>
                <SettingCheckbox
                    id="code_line_numbers"
                    name="settings[line_numbers]"
                    label="Show line numbers"
                    description="Display a line number gutter in the item form editor."
                    defaultChecked={codeSettings.lineNumbers}
                />
                <SettingCheckbox
                    id="code_line_wrapping"
                    name="settings[line_wrapping]"
                    label="Line wrapping"
                    description="Wrap long lines instead of horizontal scrolling."
                    defaultChecked={codeSettings.lineWrapping}
                />
            </div>
        );
    }

    if (fieldType === 'tag') {
        const tagSettings = parseTagFieldSettings(settings);

        return (
            <div className="space-y-4">
                <Field>
                    <FieldLabel htmlFor="tag_presets">
                        Presets (comma-separated)
                    </FieldLabel>
                    <Input
                        id="tag_presets"
                        name="settings[presets]"
                        defaultValue={tagSettings.presets.join(', ')}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="tag_separator">Separator</FieldLabel>
                    <Input
                        id="tag_separator"
                        name="settings[separator]"
                        defaultValue={tagSettings.separator}
                    />
                </Field>
                <SettingCheckbox
                    id="tag_allow_other"
                    name="settings[allow_other]"
                    label="Allow custom tags"
                    description="Let editors add tags not listed in presets."
                    defaultChecked={tagSettings.allowOther}
                />
                <SettingCheckbox
                    id="tag_lowercase"
                    name="settings[lowercase]"
                    label="Lowercase on save"
                    description="Normalize tag values to lowercase when saving."
                    defaultChecked={tagSettings.lowercase}
                />
                <SettingCheckbox
                    id="tag_alphabetize"
                    name="settings[alphabetize]"
                    label="Alphabetize on save"
                    description="Sort tags alphabetically when saving."
                    defaultChecked={tagSettings.alphabetize}
                />
            </div>
        );
    }

    if (fieldType === 'autocomplete') {
        return <AutocompletePlaceholderPanel settings={settings} />;
    }

    if (fieldType === 'api_autocomplete') {
        const apiSettings =
            apiAutocompleteSettings ??
            parseApiAutocompleteFieldSettings(settings);

        return (
            <ApiAutocompleteSettingsPanel
                settings={apiSettings}
                onChange={onApiAutocompleteSettingsChange ?? (() => undefined)}
            />
        );
    }

    return null;
}

function TextareaLikeSettingsPanel({
    fieldType,
    settings,
}: {
    fieldType: string;
    settings?: Record<string, unknown> | null;
}) {
    const textareaSettings = parseTextareaFieldSettings(settings);

    return (
        <div className="space-y-6">
            <TranslatedInput
                idPrefix={`${fieldType}_placeholder`}
                label="Placeholder"
                value={textareaSettings.placeholder}
                onChange={() => undefined}
                namePrefix="settings[placeholder]"
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel htmlFor={`${fieldType}_rows`}>Rows</FieldLabel>
                    <Input
                        id={`${fieldType}_rows`}
                        type="number"
                        min={2}
                        name="settings[rows]"
                        defaultValue={textareaSettings.rows}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor={`${fieldType}_max_length`}>
                        Max length
                    </FieldLabel>
                    <Input
                        id={`${fieldType}_max_length`}
                        type="number"
                        min={1}
                        name="settings[max_length]"
                        defaultValue={textareaSettings.maxLength ?? ''}
                    />
                </Field>
            </div>
        </div>
    );
}

function AutocompletePlaceholderPanel({
    settings,
}: {
    settings?: Record<string, unknown> | null;
}) {
    const placeholder = parseStringFieldSettings(settings).placeholder;
    const selectSettings = parseSelectFieldSettings(settings);

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Static combobox: editors pick from predefined options or type a
                custom value when allowed.
            </p>
            <TranslatedInput
                idPrefix="autocomplete_placeholder"
                label="Placeholder"
                value={placeholder}
                onChange={() => undefined}
                namePrefix="settings[placeholder]"
            />
            <SettingCheckbox
                id="autocomplete_allow_other"
                name="settings[allow_other]"
                label="Allow values outside options"
                description="Accept custom values not listed in the choices."
                defaultChecked={selectSettings.allowOther}
            />
        </div>
    );
}

function ApiAutocompleteSettingsPanel({
    settings,
    onChange,
}: {
    settings: ApiAutocompleteFieldSettings;
    onChange: (
        updater: (
            current: ApiAutocompleteFieldSettings,
        ) => ApiAutocompleteFieldSettings,
    ) => void;
}) {
    return (
        <div className="space-y-6">
            <Field>
                <FieldLabel htmlFor="api_autocomplete_url">
                    URL template <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                    id="api_autocomplete_url"
                    value={settings.url}
                    required
                    aria-required="true"
                    onChange={(event) =>
                        onChange((current) => ({
                            ...current,
                            url: event.target.value,
                        }))
                    }
                    placeholder="/demo/cities?q={{value}}"
                />
                <FieldDescription>
                    Use {'{{value}}'} as the search term placeholder.
                    Same-origin URLs avoid CORS (e.g. /demo/cities?q=
                    {'{{value}}'}).
                </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                    <FieldLabel htmlFor="api_results_path">
                        Results path
                    </FieldLabel>
                    <Input
                        id="api_results_path"
                        value={settings.resultsPath}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                resultsPath: event.target.value,
                            }))
                        }
                        placeholder="data"
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="api_text_path">Text path</FieldLabel>
                    <Input
                        id="api_text_path"
                        value={settings.textPath}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                textPath: event.target.value,
                            }))
                        }
                        placeholder="label"
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="api_value_path">Value path</FieldLabel>
                    <Input
                        id="api_value_path"
                        value={settings.valuePath}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                valuePath: event.target.value,
                            }))
                        }
                        placeholder="value"
                    />
                </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel htmlFor="api_trigger">Trigger</FieldLabel>
                    <NativeSelect
                        id="api_trigger"
                        value={settings.trigger}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                trigger:
                                    event.target.value === 'throttle'
                                        ? 'throttle'
                                        : 'debounce',
                            }))
                        }
                        className="w-full"
                    >
                        <option value="debounce">Debounce</option>
                        <option value="throttle">Throttle</option>
                    </NativeSelect>
                </Field>
                <Field>
                    <FieldLabel htmlFor="api_rate">Rate (ms)</FieldLabel>
                    <Input
                        id="api_rate"
                        type="number"
                        min={0}
                        value={settings.rate}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                rate: Number(event.target.value) || 0,
                            }))
                        }
                    />
                </Field>
            </div>
            <TranslatedInput
                idPrefix="api_autocomplete_placeholder"
                label="Placeholder"
                value={settings.placeholder}
                onChange={(placeholder) =>
                    onChange((current) => ({ ...current, placeholder }))
                }
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <LucideIconPicker
                    id="api_icon_left"
                    label="Icon left"
                    value={settings.iconLeft}
                    onChange={(iconLeft) =>
                        onChange((current) => ({ ...current, iconLeft }))
                    }
                />
                <LucideIconPicker
                    id="api_icon_right"
                    label="Icon right"
                    value={settings.iconRight}
                    onChange={(iconRight) =>
                        onChange((current) => ({ ...current, iconRight }))
                    }
                />
            </div>
        </div>
    );
}

/**
 * Serializes text/number field settings for API submission.
 * @returns {*}
 */
export function serializeTextNumbersTypeSettings(
    fieldType: string,
    stringSettings: StringFieldSettings,
    apiAutocompleteSettings?: ApiAutocompleteFieldSettings,
): Record<string, unknown> {
    if (fieldType === 'string') {
        return serializeStringFieldSettings(stringSettings);
    }

    if (fieldType === 'api_autocomplete' && apiAutocompleteSettings) {
        return serializeApiAutocompleteFieldSettings(apiAutocompleteSettings);
    }

    return {};
}
