export type CollectionFieldTypeOption = {
    value: string;
    label: string;
    description?: string;
};

export const COLLECTION_FIELD_TYPES: CollectionFieldTypeOption[] = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'code', label: 'Code' },
    { value: 'select', label: 'Select' },
    { value: 'multiselect', label: 'Multiselect' },
    { value: 'radio_group', label: 'Radio group' },
    { value: 'date', label: 'Date' },
    { value: 'color', label: 'Color' },
    { value: 'tag', label: 'Tag' },
];
