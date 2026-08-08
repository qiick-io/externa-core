/** Layout group field types. */
export const LAYOUT_GROUP_TYPES = [
    'group_accordion',
    'group_detail',
    'group_raw',
    'group_tabs',
] as const;

export type LayoutGroupType = (typeof LAYOUT_GROUP_TYPES)[number];

/**
 * @param type - Field type key
 * @returns Whether the type is a layout group
 */
export function isLayoutGroupType(type: string): boolean {
    return LAYOUT_GROUP_TYPES.includes(type as LayoutGroupType);
}

/**
 * Accordion/Tabs: direct children are section/tab panels (usually group_raw).
 */
export function isPanelContainerType(type: string): boolean {
    return type === 'group_accordion' || type === 'group_tabs';
}

/**
 * @param field - Field definition
 * @returns Parent field name from settings.group, or null
 */
export function getFieldGroupName(
    field: { settings?: Record<string, unknown> | null },
): string | null {
    const group = field.settings?.group;

    if (typeof group === 'string' && group.trim() !== '') {
        return group.trim();
    }

    return null;
}

/** Tree node with nested children. */
export type FieldTreeNode<T> = {
    field: T;
    children: FieldTreeNode<T>[];
};

/** Flattened tree row for the fields list. */
export type FlatFieldTreeItem<T> = {
    field: T;
    depth: number;
};

/**
 * Build tree from fields by settings.group + sort_order.
 *
 * @param fields - Fields in sort order
 * @returns Root nodes with nested children
 */
export function buildFieldTree<
    T extends { name: string; settings?: Record<string, unknown> | null },
>(fields: T[]): FieldTreeNode<T>[] {
    const byName = new Map<string, FieldTreeNode<T>>();

    for (const field of fields) {
        byName.set(field.name, { field, children: [] });
    }

    const roots: FieldTreeNode<T>[] = [];

    for (const field of fields) {
        const node = byName.get(field.name);

        if (!node) {
            continue;
        }

        const parentName = getFieldGroupName(field);

        if (!parentName) {
            roots.push(node);

            continue;
        }

        const parent = byName.get(parentName);

        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

/**
 * Depth-first flatten of a field tree (for indented list UI).
 */
export function flattenFieldTree<T>(
    tree: FieldTreeNode<T>[],
    depth = 0,
): FlatFieldTreeItem<T>[] {
    const out: FlatFieldTreeItem<T>[] = [];

    for (const node of tree) {
        out.push({ field: node.field, depth });
        out.push(...flattenFieldTree(node.children, depth + 1));
    }

    return out;
}

/**
 * Apply a group map onto field settings for optimistic tree rendering.
 *
 * @param fields - Fields in list order
 * @param groups - field id → parent name | null
 */
export function fieldsWithGroupOverrides<
    T extends {
        id: number;
        settings?: Record<string, unknown> | null;
    },
>(fields: T[], groups: Map<number, string | null>): T[] {
    return fields.map((field) => {
        if (!groups.has(field.id)) {
            return field;
        }

        const group = groups.get(field.id) ?? null;
        const settings = { ...(field.settings ?? {}) };

        if (group === null) {
            delete settings.group;
        } else {
            settings.group = group;
        }

        return { ...field, settings };
    });
}

/**
 * Whether nesting `activeName` under `parentName` would create a cycle.
 */
export function wouldCreateGroupCycle(
    fields: { name: string; settings?: Record<string, unknown> | null }[],
    activeName: string,
    parentName: string,
): boolean {
    if (activeName === parentName) {
        return true;
    }

    const byName = new Map(fields.map((field) => [field.name, field]));
    let cursor: string | null = parentName;
    const seen = new Set<string>([activeName]);

    while (cursor) {
        if (seen.has(cursor)) {
            return true;
        }

        seen.add(cursor);
        const parent = byName.get(cursor);
        cursor = parent ? getFieldGroupName(parent) : null;
    }

    return false;
}

/**
 * Find a tree node by field id.
 */
export function findFieldTreeNodeById<T extends { id: number }>(
    nodes: FieldTreeNode<T>[],
    fieldId: number,
): FieldTreeNode<T> | null {
    for (const node of nodes) {
        if (node.field.id === fieldId) {
            return node;
        }

        const nested = findFieldTreeNodeById(node.children, fieldId);

        if (nested) {
            return nested;
        }
    }

    return null;
}

/**
 * Depth-first field ids for a node and its descendants.
 */
export function collectFieldTreeIds<T extends { id: number }>(
    node: FieldTreeNode<T>,
): number[] {
    const ids = [node.field.id];

    for (const child of node.children) {
        ids.push(...collectFieldTreeIds(child));
    }

    return ids;
}

/**
 * Move a field (and its descendant block) under a new parent / sibling slot.
 * Flat order stays DFS-contiguous like Directus nested sort.
 *
 * @param beforeSiblingId - Insert before this sibling under the new parent; null appends.
 */
export function moveFieldInGroupTree<
    T extends {
        id: number;
        name: string;
        settings?: Record<string, unknown> | null;
    },
>(
    fields: T[],
    groups: Map<number, string | null>,
    activeId: number,
    newParentName: string | null,
    beforeSiblingId: number | null = null,
): { fields: T[]; groups: Map<number, string | null> } {
    const activeField = fields.find((field) => field.id === activeId);

    if (!activeField) {
        return { fields, groups };
    }

    if (
        newParentName !== null &&
        wouldCreateGroupCycle(
            fieldsWithGroupOverrides(fields, groups),
            activeField.name,
            newParentName,
        )
    ) {
        return { fields, groups };
    }

    const nextGroups = new Map(groups);
    nextGroups.set(activeId, newParentName);

    const withOverrides = fieldsWithGroupOverrides(fields, nextGroups);
    const tree = buildFieldTree(withOverrides);
    const activeNode = findFieldTreeNodeById(tree, activeId);

    if (!activeNode) {
        return { fields, groups: nextGroups };
    }

    const subtreeIds = new Set(collectFieldTreeIds(activeNode));
    const subtree = fields.filter((field) => subtreeIds.has(field.id));
    const rest = fields.filter((field) => !subtreeIds.has(field.id));

    let insertAt = rest.length;

    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex(
            (field) => field.id === beforeSiblingId,
        );

        if (siblingIndex !== -1) {
            insertAt = siblingIndex;
        }
    } else if (newParentName !== null) {
        const parentField = rest.find((field) => field.name === newParentName);

        if (parentField) {
            const restTree = buildFieldTree(
                fieldsWithGroupOverrides(rest, nextGroups),
            );
            const parentNode = findFieldTreeNodeById(restTree, parentField.id);
            const parentOrderedIndex = rest.findIndex(
                (field) => field.id === parentField.id,
            );

            if (parentNode) {
                const descendantIds = new Set(collectFieldTreeIds(parentNode));
                let lastIndex = parentOrderedIndex;

                for (let index = 0; index < rest.length; index += 1) {
                    if (descendantIds.has(rest[index].id)) {
                        lastIndex = index;
                    }
                }

                insertAt = lastIndex + 1;
            } else if (parentOrderedIndex !== -1) {
                insertAt = parentOrderedIndex + 1;
            }
        }
    }

    return {
        fields: [
            ...rest.slice(0, insertAt),
            ...subtree,
            ...rest.slice(insertAt),
        ],
        groups: nextGroups,
    };
}
