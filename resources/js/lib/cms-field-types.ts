export type CmsFieldTypeOption = {
    value: string;
    label: string;
    description?: string;
};

export const CMS_FIELD_TYPES: CmsFieldTypeOption[] = [
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
