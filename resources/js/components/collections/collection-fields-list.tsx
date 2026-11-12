import { useMemo, useRef } from 'react';
import { rowBreakFieldIdsFromFields } from '@/components/collections/fields-list/field-list-layout';
import {
    FieldTreeNodes,
    FlatFieldList,
} from '@/components/collections/fields-list/field-tree';
import { useSortableFields } from '@/components/collections/fields-list/use-sortable-fields';
import {
    buildFieldTree,
    getFieldGroupName,
    isLayoutGroupType,
} from '@/lib/collection-field-groups';
import type { CollectionFieldRow } from '@/types';

type CollectionFieldsListProps = {
    collectionId: number;
    fields: CollectionFieldRow[];
    reorderEnabled: boolean;
    onEdit: (field: CollectionFieldRow) => void;
};

function StaticFieldsList({
    collectionId,
    fields,
    reorderEnabled,
    onEdit,
}: CollectionFieldsListProps) {
    const hasGroups = useMemo(() => {
        return fields.some(
            (field) =>
                isLayoutGroupType(field.type) ||
                getFieldGroupName(field) !== null,
        );
    }, [fields]);

    const fieldTree = useMemo(() => {
        if (!hasGroups) {
            return null;
        }

        return buildFieldTree(fields);
    }, [fields, hasGroups]);

    const rowBreakFieldIds = useMemo(
        () => rowBreakFieldIdsFromFields(fields),
        [fields],
    );

    if (hasGroups && fieldTree) {
        return (
            <FieldTreeNodes
                nodes={fieldTree}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={fields}
                reorderEnabled={reorderEnabled}
                rowBreakFieldIds={rowBreakFieldIds}
            />
        );
    }

    return (
        <FlatFieldList
            fields={fields}
            collectionId={collectionId}
            onEdit={onEdit}
            reorderEnabled={reorderEnabled}
            rowBreakFieldIds={rowBreakFieldIds}
        />
    );
}

function SortableFieldsList({
    collectionId,
    fields,
    onEdit,
}: Omit<CollectionFieldsListProps, 'reorderEnabled'>) {
    const rootRef = useRef<HTMLDivElement>(null);
    const {
        orderedFields,
        rowBreakFieldIds,
        fieldsForTree,
        hasGroups,
        fieldTree,
    } = useSortableFields(collectionId, fields, rootRef);

    return (
        <div ref={rootRef} data-fields-dnd>
            {hasGroups && fieldTree ? (
                <FieldTreeNodes
                    nodes={fieldTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={orderedFields}
                    reorderEnabled
                    rowBreakFieldIds={rowBreakFieldIds}
                />
            ) : (
                <FlatFieldList
                    fields={fieldsForTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    reorderEnabled
                    rowBreakFieldIds={rowBreakFieldIds}
                />
            )}
        </div>
    );
}

/**
 * Sortable list of fields on a collection schema.
 */
export function CollectionFieldsList(props: CollectionFieldsListProps) {
    if (props.reorderEnabled) {
        return (
            <SortableFieldsList
                collectionId={props.collectionId}
                fields={props.fields}
                onEdit={props.onEdit}
            />
        );
    }

    return <StaticFieldsList {...props} />;
}
