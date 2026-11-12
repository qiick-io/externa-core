import type { ReactNode } from 'react';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import type { FieldDef } from '@/types';

/** Stored item value handed to a field input as its initial (uncontrolled) value. */
export type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

/**
 * Everything an item field input needs to render one control: the field
 * schema, the form name / DOM id of the control and the stored value.
 */
export type FieldRenderContext = {
    field: FieldDef;
    name: string;
    id: string;
    collectionId: number;
    locales: string[];
    readonly: boolean;
    defaultValue: DefaultValue;
    relatedCollections: RelatedCollectionOption[];
    /** When rendering a nested blocks field, parent depth + 1 (see BlocksFieldInput). */
    nestingDepth?: number;
    /** Root blocks max nesting, threaded through nested blocks. */
    maxBlocksDepth?: number;
    /** Whether this field has a validation error */
    hasError?: boolean;
    /** DOM id of the linked FieldError for aria-describedby */
    errorId?: string;
    markdownMode?: 'edit' | 'preview';
    onMarkdownModeChange?: (mode: 'edit' | 'preview') => void;
    showMarkdownModeToggle?: boolean;
    /** Live value changes for conditions (boolean switch has no native change bubble). */
    onValueChange?: (value: unknown) => void;
};

/**
 * Props of a registry input: the render context plus the renderer itself, so
 * the blocks input can render nested fields without importing the registry
 * (which would make an import cycle).
 */
export type FieldInputProps = FieldRenderContext & {
    renderNestedField: (context: FieldRenderContext) => ReactNode;
};

/** One entry of the field type → input registry. */
export type FieldInputComponent = (props: FieldInputProps) => ReactNode;
