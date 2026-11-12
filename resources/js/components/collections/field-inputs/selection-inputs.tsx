import type { FieldInputProps } from '@/components/collections/field-inputs/field-input-props';
import { toStringArray } from '@/components/collections/field-inputs/field-input-values';
import {
    BooleanToggleInput,
    CheckboxGroupInput,
    CheckboxGroupTreeInput,
    MultiselectWithOtherInput,
    RadioWithOtherInput,
    SelectWithOtherInput,
    defaultBooleanChecked,
} from '@/components/collections/item-field-choice-inputs';
import { DateFieldInput } from '@/components/collections/item-field-date-input';
import { ColorFieldInput } from '@/components/collections/item-field-rich-inputs';
import { MapCoordinateInput } from '@/components/collections/map-coordinate-input';
import {
    parseDateFieldSettings,
    parseFieldOptions,
    parseSelectFieldSettings,
} from '@/lib/collection-field-types';
import type { FieldDef } from '@/types';
import { scalarToString } from '@/lib/scalar-to-string';

/**
 * Item inputs for the "selection" field types of the type picker.
 */

/** Static choices of the field, without rows whose value is still blank. */
function filledOptions(field: FieldDef) {
    return parseFieldOptions(field.settings).filter(
        (option) => option.value.trim() !== '',
    );
}

export function BooleanFieldEntry({
    field,
    id,
    name,
    locales,
    readonly,
    defaultValue,
    onValueChange,
}: FieldInputProps) {
    return (
        <BooleanToggleInput
            id={id}
            name={name}
            defaultChecked={defaultBooleanChecked(defaultValue)}
            settings={field.settings}
            locales={locales}
            readonly={readonly}
            onCheckedChange={(checked) => onValueChange?.(checked)}
        />
    );
}

export function DateFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
    hasError,
}: FieldInputProps) {
    const dateSettings = parseDateFieldSettings(field.settings);

    return (
        <DateFieldInput
            id={id}
            name={name}
            mode={dateSettings.mode}
            includeSeconds={dateSettings.includeSeconds}
            defaultValue={defaultValue}
            readonly={readonly}
            hasError={hasError}
        />
    );
}

export function MapFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <MapCoordinateInput
            idPrefix={id}
            nameBase={name}
            defaultValue={defaultValue}
            readonly={readonly}
            settings={field.settings}
        />
    );
}

export function ColorFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <ColorFieldInput
            id={id}
            name={name}
            settings={field.settings}
            defaultValue={scalarToString(defaultValue, '#000000')}
            readonly={readonly}
        />
    );
}

export function SelectFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    const selectSettings = parseSelectFieldSettings(field.settings);

    return (
        <SelectWithOtherInput
            id={id}
            name={name}
            options={filledOptions(field)}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
            allowNone={selectSettings.allowNone}
            allowOther={selectSettings.allowOther}
        />
    );
}

export function MultiselectFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    const selectSettings = parseSelectFieldSettings(field.settings);

    return (
        <MultiselectWithOtherInput
            name={name}
            options={filledOptions(field)}
            defaultValues={toStringArray(defaultValue)}
            readonly={readonly}
            allowOther={selectSettings.allowOther}
        />
    );
}

export function CheckboxGroupFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    const selectSettings = parseSelectFieldSettings(field.settings);

    return (
        <CheckboxGroupInput
            name={name}
            options={filledOptions(field)}
            defaultValues={toStringArray(defaultValue)}
            readonly={readonly}
            allowOther={selectSettings.allowOther}
        />
    );
}

export function CheckboxGroupTreeFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <CheckboxGroupTreeInput
            name={name}
            settings={field.settings}
            defaultValues={toStringArray(defaultValue)}
            readonly={readonly}
        />
    );
}

export function RadioGroupFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    const selectSettings = parseSelectFieldSettings(field.settings);

    return (
        <RadioWithOtherInput
            name={name}
            options={filledOptions(field)}
            defaultValue={scalarToString(defaultValue, '')}
            readonly={readonly}
            allowOther={selectSettings.allowOther}
        />
    );
}
