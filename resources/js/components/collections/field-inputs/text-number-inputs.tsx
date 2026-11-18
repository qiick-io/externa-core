import type { FieldInputProps } from '@/components/collections/field-inputs/field-input-props';
import { toStringArray } from '@/components/collections/field-inputs/field-input-values';
import {
    ApiAutocompleteInput,
    InputWithIcons,
    StaticAutocompleteInput,
} from '@/components/collections/item-field-choice-inputs';
import {
    CodeFieldInput,
    MarkdownFieldInput,
    TagChipInput,
    WysiwygFieldInput,
} from '@/components/collections/item-field-rich-inputs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    getFieldPlaceholder,
    parseNumberFieldSettings,
    parseStringFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';
import { scalarToString } from '@/lib/scalar-to-string';

/**
 * Item inputs for the "text & numbers" field types of the type picker.
 */

/** aria-describedby target: the field error, only while there is one. */
function errorDescribedBy({
    hasError,
    errorId,
}: Pick<FieldInputProps, 'hasError' | 'errorId'>): string | undefined {
    return hasError && errorId ? errorId : undefined;
}

/** Plain text input: the fallback for types without a dedicated input. */
export function PlainTextFieldEntry(props: FieldInputProps) {
    const { field, id, name, locales, readonly, defaultValue, hasError } =
        props;

    return (
        <Input
            id={id}
            type="text"
            name={name}
            defaultValue={scalarToString(defaultValue, '')}
            placeholder={getFieldPlaceholder(field.settings, locales)}
            readOnly={readonly}
            aria-invalid={hasError}
            aria-describedby={errorDescribedBy(props)}
        />
    );
}

/** Text input with optional icons, masking and numeric input subtypes. */
export function StringFieldEntry(props: FieldInputProps) {
    const { field, id, name, locales, readonly, defaultValue, hasError } =
        props;
    const stringSettings = parseStringFieldSettings(field.settings);

    return (
        <InputWithIcons
            iconLeft={stringSettings.iconLeft}
            iconRight={stringSettings.iconRight}
        >
            <Input
                id={id}
                type={
                    stringSettings.masked
                        ? 'password'
                        : stringSettings.inputType === 'integer' ||
                            stringSettings.inputType === 'float' ||
                            stringSettings.inputType === 'decimal'
                          ? 'number'
                          : 'text'
                }
                name={name}
                defaultValue={scalarToString(defaultValue, '')}
                placeholder={getFieldPlaceholder(field.settings, locales)}
                maxLength={stringSettings.maxLength ?? undefined}
                readOnly={readonly}
                aria-invalid={hasError}
                aria-describedby={errorDescribedBy(props)}
            />
        </InputWithIcons>
    );
}

export function NumberFieldEntry(props: FieldInputProps) {
    const { field, id, name, locales, readonly, defaultValue, hasError } =
        props;
    const numberSettings = parseNumberFieldSettings(field.settings);

    return (
        <Input
            id={id}
            type="number"
            step={numberSettings.step ?? 'any'}
            min={numberSettings.min ?? undefined}
            max={numberSettings.max ?? undefined}
            name={name}
            defaultValue={scalarToString(defaultValue, '')}
            placeholder={getFieldPlaceholder(field.settings, locales)}
            readOnly={readonly}
            aria-invalid={hasError}
            aria-describedby={errorDescribedBy(props)}
        />
    );
}

export function TextareaFieldEntry(props: FieldInputProps) {
    const { field, id, name, locales, readonly, defaultValue, hasError } =
        props;
    const textareaSettings = parseTextareaFieldSettings(field.settings);

    return (
        <Textarea
            id={id}
            name={name}
            // field-sizing-content grows with the text; `rows` sets the starting height.
            style={{
                minHeight: `calc(${textareaSettings.rows}lh + 1rem)`,
            }}
            defaultValue={scalarToString(defaultValue, '')}
            placeholder={resolveTranslatedText(
                textareaSettings.placeholder,
                locales,
                getFieldPlaceholder(field.settings, locales),
            )}
            readOnly={readonly}
            aria-invalid={hasError}
            aria-describedby={errorDescribedBy(props)}
        />
    );
}

export function WysiwygFieldEntry({
    field,
    id,
    name,
    locales,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <WysiwygFieldInput
            id={id}
            name={name}
            settings={field.settings}
            locales={locales}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
            placeholder={getFieldPlaceholder(field.settings, locales)}
        />
    );
}

export function MarkdownFieldEntry({
    field,
    id,
    name,
    locales,
    readonly,
    defaultValue,
    markdownMode,
    onMarkdownModeChange,
    showMarkdownModeToggle,
}: FieldInputProps) {
    return (
        <MarkdownFieldInput
            id={id}
            name={name}
            settings={field.settings}
            locales={locales}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
            placeholder={getFieldPlaceholder(field.settings, locales)}
            mode={markdownMode}
            onModeChange={onMarkdownModeChange}
            showModeToggle={showMarkdownModeToggle ?? true}
        />
    );
}

export function CodeFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <CodeFieldInput
            id={id}
            name={name}
            settings={field.settings}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
        />
    );
}

export function AutocompleteFieldEntry({
    field,
    id,
    name,
    locales,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <StaticAutocompleteInput
            id={id}
            name={name}
            settings={field.settings}
            locales={locales}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
        />
    );
}

export function ApiAutocompleteFieldEntry({
    field,
    id,
    name,
    locales,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <ApiAutocompleteInput
            id={id}
            name={name}
            settings={field.settings}
            locales={locales}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
        />
    );
}

export function TagFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <TagChipInput
            nameBase={name}
            settings={field.settings}
            defaultParts={toStringArray(defaultValue)}
            readonly={readonly}
        />
    );
}
