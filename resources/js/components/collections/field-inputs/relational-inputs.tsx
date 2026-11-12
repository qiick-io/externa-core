import type { FieldInputProps } from '@/components/collections/field-inputs/field-input-props';
import {
    toNumberArray,
    toNumberOrNull,
} from '@/components/collections/field-inputs/field-input-values';
import { BlocksFieldInput } from '@/components/collections/item-field-blocks-input';
import {
    FileFieldInput,
    MultipleFilesFieldInput,
} from '@/components/collections/item-field-files-input';
import { M2aFieldInput } from '@/components/collections/item-field-m2a-input';
import {
    ManyToManyFieldInput,
    RelationFieldInput,
} from '@/components/collections/item-field-relation-inputs';
import {
    isFilesFieldMultiple,
    isImageFieldMultiple,
} from '@/lib/collection-field-types';

/**
 * Item inputs for the "relational" field types of the type picker
 * (files, relations and blocks).
 */

export function ImageFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    if (isImageFieldMultiple(field.settings)) {
        return (
            <MultipleFilesFieldInput
                name={name}
                defaultFileIds={toNumberArray(defaultValue)}
                acceptImagesOnly
                readonly={readonly}
            />
        );
    }

    return (
        <FileFieldInput
            name={name}
            defaultFileId={toNumberOrNull(defaultValue)}
            acceptImagesOnly
            readonly={readonly}
        />
    );
}

export function FilesFieldEntry({
    field,
    name,
    readonly,
    defaultValue,
}: FieldInputProps) {
    if (isFilesFieldMultiple(field.settings)) {
        return (
            <MultipleFilesFieldInput
                name={name}
                defaultFileIds={toNumberArray(defaultValue)}
                readonly={readonly}
            />
        );
    }

    return (
        <FileFieldInput
            name={name}
            defaultFileId={toNumberOrNull(defaultValue)}
            readonly={readonly}
        />
    );
}

export function ManyToOneFieldEntry({
    field,
    name,
    collectionId,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <RelationFieldInput
            collectionId={collectionId}
            field={field}
            name={name}
            defaultValue={toNumberOrNull(defaultValue)}
            readonly={readonly}
        />
    );
}

export function ManyToManyFieldEntry({
    field,
    name,
    collectionId,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <ManyToManyFieldInput
            collectionId={collectionId}
            field={field}
            name={name}
            defaultValue={defaultValue}
            readonly={readonly}
        />
    );
}

export function OneToManyFieldEntry({
    field,
    name,
    collectionId,
    readonly,
    defaultValue,
}: FieldInputProps) {
    return (
        <RelationFieldInput
            collectionId={collectionId}
            field={field}
            name={name}
            defaultValue={toNumberArray(defaultValue)}
            multiple
            readonly={readonly}
        />
    );
}

export function M2aFieldEntry({
    field,
    name,
    collectionId,
    readonly,
    defaultValue,
    relatedCollections,
}: FieldInputProps) {
    return (
        <M2aFieldInput
            collectionId={collectionId}
            field={field}
            name={name}
            defaultValue={defaultValue}
            readonly={readonly}
            relatedCollections={relatedCollections}
        />
    );
}

export function BlocksFieldEntry({
    field,
    name,
    collectionId,
    locales,
    readonly,
    defaultValue,
    relatedCollections,
    nestingDepth,
    maxBlocksDepth,
    renderNestedField,
}: FieldInputProps) {
    return (
        <BlocksFieldInput
            collectionId={collectionId}
            field={field}
            name={name}
            defaultValue={defaultValue}
            readonly={readonly}
            relatedCollections={relatedCollections}
            locales={locales}
            depth={nestingDepth ?? 1}
            maxBlocksDepth={maxBlocksDepth}
            renderNestedField={renderNestedField}
        />
    );
}
