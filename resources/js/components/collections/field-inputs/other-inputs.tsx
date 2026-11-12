import type { FieldInputProps } from '@/components/collections/field-inputs/field-input-props';
import {
    HashFieldInput,
    SliderFieldInput,
} from '@/components/collections/item-field-choice-inputs';
import { scalarToString } from '@/lib/scalar-to-string';

/**
 * Item inputs for the "other" field types of the type picker.
 */

export function HashFieldEntry({
    field,
    id,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <HashFieldInput
            id={id}
            name={name}
            defaultValue={scalarToString(defaultValue, '')}
            settings={field.settings}
            readonly={readonly}
        />
    );
}

export function SliderFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <SliderFieldInput
            name={name}
            settings={field.settings}
            defaultValue={Number(defaultValue ?? 0)}
            readonly={readonly}
        />
    );
}
