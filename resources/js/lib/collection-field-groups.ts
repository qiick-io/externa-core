/** Layout group field types. */
const LAYOUT_GROUP_TYPES = [
    'group_accordion',
    'group_detail',
    'group_raw',
    'group_tabs',
] as const;

type LayoutGroupType = (typeof LAYOUT_GROUP_TYPES)[number];

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
 * Any field may nest under any layout group (API + UI),
 * including leaf→Accordion/Tabs directly. Cycle checks stay separate.
 *
 * @param _childType - Dragged field type (unused; no type gate)
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
export function getFieldGroupName(field: {
    settings?: Record<string, unknown> | null;
}): string | null {
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

        const settings = { ...field.settings };

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
