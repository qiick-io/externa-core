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
 * Accordion/Tabs: direct children are panels (group_raw sections or leaves).
 */
export function isPanelContainerType(type: string): boolean {
    return type === 'group_accordion' || type === 'group_tabs';
}

/**
 * Directus data-model: any field may nest under any layout group (API + UI),
 * including leaf→Accordion/Tabs directly. Cycle checks stay separate.
 *
 * @param _childType - Dragged field type (unused; Directus has no type gate)
 * @param parentType - Target group type
 */
export function canNestFieldIntoGroup(
    _childType: string,
    parentType: string,
): boolean {
    return isLayoutGroupType(parentType);
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
 * Reorder a sibling list in-place-style (new array only when order changes).
 * Moved node object is reused so React can skip untouched subtrees.
 */
function reorderSiblingNodes<T extends { id: number }>(
    siblings: FieldTreeNode<T>[],
    activeId: number,
    beforeSiblingId: number | null,
): FieldTreeNode<T>[] {
    const activeIndex = siblings.findIndex(
        (node) => node.field.id === activeId,
    );

    if (activeIndex === -1) {
        return siblings;
    }

    const activeNode = siblings[activeIndex];
    const rest = siblings.filter((node) => node.field.id !== activeId);
    let insertAt = rest.length;

    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex(
            (node) => node.field.id === beforeSiblingId,
        );

        if (siblingIndex !== -1) {
            insertAt = siblingIndex;
        }
    }

    const next = [
        ...rest.slice(0, insertAt),
        activeNode,
        ...rest.slice(insertAt),
    ];

    const unchanged = next.every((node, index) => node === siblings[index]);

    return unchanged ? siblings : next;
}

/**
 * Same-parent live drag: reorder one sibling list without rebuilding the whole
 * tree (preserves node identity outside the touched parent path).
 */
export function reorderTreeSiblings<T extends { id: number; name: string }>(
    nodes: FieldTreeNode<T>[],
    parentName: string | null,
    activeId: number,
    beforeSiblingId: number | null,
): FieldTreeNode<T>[] {
    if (parentName === null) {
        return reorderSiblingNodes(nodes, activeId, beforeSiblingId);
    }

    let changed = false;

    const walk = (list: FieldTreeNode<T>[]): FieldTreeNode<T>[] => {
        let listChanged = false;

        const next = list.map((node) => {
            if (node.field.name === parentName) {
                const nextChildren = reorderSiblingNodes(
                    node.children,
                    activeId,
                    beforeSiblingId,
                );

                if (nextChildren === node.children) {
                    return node;
                }

                listChanged = true;

                return { field: node.field, children: nextChildren };
            }

            if (node.children.length === 0) {
                return node;
            }

            const nextChildren = walk(node.children);

            if (nextChildren === node.children) {
                return node;
            }

            listChanged = true;

            return { field: node.field, children: nextChildren };
        });

        if (listChanged) {
            changed = true;

            return next;
        }

        return list;
    };

    const result = walk(nodes);

    return changed ? result : nodes;
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

        // ponytail: keep object identity when parent already matches — drag
        // rebuilds this map every frame; cloning 100+ rows kills React.
        if (getFieldGroupName(field) === group) {
            return field;
        }

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

function fieldIsUnderGroupName<
    T extends {
        id: number;
        name: string;
        settings?: Record<string, unknown> | null;
    },
>(
    field: T,
    groupName: string,
    groups: Map<number, string | null>,
    byName: Map<string, T>,
): boolean {
    let cursor: string | null = groups.get(field.id) ?? getFieldGroupName(field);

    for (let depth = 0; depth < 32 && cursor !== null; depth += 1) {
        if (cursor === groupName) {
            return true;
        }

        const parent = byName.get(cursor);
        cursor = parent
            ? (groups.get(parent.id) ?? getFieldGroupName(parent))
            : null;
    }

    return false;
}

/**
 * Same-parent sibling reorder: relocate the active DFS block without rebuilding
 * the group map or running nest/cycle checks (live drag path).
 *
 * @param beforeSiblingId - Insert before this sibling; null appends under parent.
 * @returns Same `fields` reference when the slot is unchanged.
 */
export function moveSameParentSiblingBlock<
    T extends {
        id: number;
        name: string;
        type?: string;
        settings?: Record<string, unknown> | null;
    },
>(
    fields: T[],
    groups: Map<number, string | null>,
    activeId: number,
    beforeSiblingId: number | null,
): T[] {
    const activeField = fields.find((field) => field.id === activeId);

    if (!activeField) {
        return fields;
    }

    const parentName =
        groups.get(activeId) ?? getFieldGroupName(activeField);
    const byName = new Map(fields.map((field) => [field.name, field]));
    const subtreeIds = new Set<number>([activeId]);

    // Collect DFS descendants by parent chain (not type) so same-parent moves
    // keep nested blocks contiguous even when type is missing in tests/helpers.
    for (const field of fields) {
        if (
            field.id !== activeId &&
            fieldIsUnderGroupName(field, activeField.name, groups, byName)
        ) {
            subtreeIds.add(field.id);
        }
    }

    const block: T[] = [];
    const rest: T[] = [];

    for (const field of fields) {
        if (subtreeIds.has(field.id)) {
            block.push(field);
        } else {
            rest.push(field);
        }
    }

    let insertAt = rest.length;

    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex(
            (field) => field.id === beforeSiblingId,
        );

        if (siblingIndex !== -1) {
            insertAt = siblingIndex;
        }
    } else if (parentName !== null) {
        const parentIndex = rest.findIndex(
            (field) => field.name === parentName,
        );

        if (parentIndex !== -1) {
            let lastIndex = parentIndex;

            for (let index = parentIndex + 1; index < rest.length; index += 1) {
                if (
                    fieldIsUnderGroupName(
                        rest[index],
                        parentName,
                        groups,
                        byName,
                    )
                ) {
                    lastIndex = index;
                } else {
                    break;
                }
            }

            insertAt = lastIndex + 1;
        }
    }

    const next = [
        ...rest.slice(0, insertAt),
        ...block,
        ...rest.slice(insertAt),
    ];

    const unchanged =
        next.length === fields.length &&
        next.every((field, index) => field.id === fields[index]?.id);

    return unchanged ? fields : next;
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

    const currentParent =
        groups.get(activeId) ?? getFieldGroupName(activeField);

    // Same parent: skip nest/cycle work — live drag calls this path a lot.
    if (currentParent === newParentName) {
        return {
            fields: moveSameParentSiblingBlock(
                fields,
                groups,
                activeId,
                beforeSiblingId,
            ),
            groups,
        };
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
