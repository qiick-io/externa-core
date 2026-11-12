import type { ReactNode } from 'react';
import type {
    FieldInputComponent,
    FieldRenderContext,
} from '@/components/collections/field-inputs/field-input-props';
import {
    HashFieldEntry,
    SliderFieldEntry,
} from '@/components/collections/field-inputs/other-inputs';
import {
    BlocksFieldEntry,
    FilesFieldEntry,
    ImageFieldEntry,
    M2aFieldEntry,
    ManyToManyFieldEntry,
    ManyToOneFieldEntry,
    OneToManyFieldEntry,
} from '@/components/collections/field-inputs/relational-inputs';
import {
    BooleanFieldEntry,
    CheckboxGroupFieldEntry,
    CheckboxGroupTreeFieldEntry,
    ColorFieldEntry,
    DateFieldEntry,
    MapFieldEntry,
    MultiselectFieldEntry,
    RadioGroupFieldEntry,
    SelectFieldEntry,
} from '@/components/collections/field-inputs/selection-inputs';
import {
    ApiAutocompleteFieldEntry,
    AutocompleteFieldEntry,
    CodeFieldEntry,
    MarkdownFieldEntry,
    NumberFieldEntry,
    PlainTextFieldEntry,
    StringFieldEntry,
    TagFieldEntry,
    TextareaFieldEntry,
    WysiwygFieldEntry,
} from '@/components/collections/field-inputs/text-number-inputs';

/**
 * Field type (FieldTypeEnum value) → item form input.
 *
 * Every type of the PHP enum has an entry; registry.test.ts fails when a new
 * type is added without one. Types missing here at runtime (stale schema)
 * fall back to a plain text input.
 */
export const FIELD_INPUT_REGISTRY: Readonly<
    Record<string, FieldInputComponent>
> = {
    // Text & numbers
    string: StringFieldEntry,
    autocomplete: AutocompleteFieldEntry,
    api_autocomplete: ApiAutocompleteFieldEntry,
    code: CodeFieldEntry,
    textarea: TextareaFieldEntry,
    wysiwyg: WysiwygFieldEntry,
    markdown: MarkdownFieldEntry,
    tag: TagFieldEntry,
    number: NumberFieldEntry,
    // Selection
    boolean: BooleanFieldEntry,
    date: DateFieldEntry,
    map: MapFieldEntry,
    color: ColorFieldEntry,
    select: SelectFieldEntry,
    multiselect: MultiselectFieldEntry,
    checkbox_group: CheckboxGroupFieldEntry,
    checkbox_group_tree: CheckboxGroupTreeFieldEntry,
    radio_group: RadioGroupFieldEntry,
    // Relational
    image: ImageFieldEntry,
    files: FilesFieldEntry,
    blocks: BlocksFieldEntry,
    m2a: M2aFieldEntry,
    many_to_many: ManyToManyFieldEntry,
    one_to_many: OneToManyFieldEntry,
    many_to_one: ManyToOneFieldEntry,
    // Other
    hash: HashFieldEntry,
    slider: SliderFieldEntry,
    // Layout groups render through group-field-renderer and never reach the
    // registry; the plain text input keeps the previous fallback if one does.
    group_accordion: PlainTextFieldEntry,
    group_detail: PlainTextFieldEntry,
    group_raw: PlainTextFieldEntry,
    group_tabs: PlainTextFieldEntry,
};

/**
 * Renders the item form control for one field through the registry.
 * Also handed to the blocks input to render its nested fields.
 */
export function renderFieldControl(context: FieldRenderContext): ReactNode {
    const fieldType = context.field.type;
    // hasOwn: a type like "constructor" must not resolve to an Object.prototype member.
    const FieldInput = Object.hasOwn(FIELD_INPUT_REGISTRY, fieldType)
        ? FIELD_INPUT_REGISTRY[fieldType]
        : PlainTextFieldEntry;

    return <FieldInput {...context} renderNestedField={renderFieldControl} />;
}
