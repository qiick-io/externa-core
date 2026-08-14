import type { FieldTreeOptionRow } from './collection-field-types/catalog';

/** Collect every descendant value under a node (not including the node itself). */
export function collectDescendantValues(node: FieldTreeOptionRow): string[] {
    if (!node.children?.length) {
        return [];
    }

    const values: string[] = [];

    for (const child of node.children) {
        if (child.value.trim() !== '') {
            values.push(child.value);
        }

        values.push(...collectDescendantValues(child));
    }

    return values;
}

/** Values of leaf nodes only (nodes without children). */
export function collectTreeLeafValues(nodes: FieldTreeOptionRow[]): string[] {
    const leafValues: string[] = [];

    for (const node of nodes) {
        if (node.children && node.children.length > 0) {
            leafValues.push(...collectTreeLeafValues(node.children));
            continue;
        }

        if (node.value.trim() !== '') {
            leafValues.push(node.value);
        }
    }

    return leafValues;
}

/** Parent node values (nodes that have children) — used as expand keys. */
export function collectExpandableKeys(nodes: FieldTreeOptionRow[]): string[] {
    const keys: string[] = [];

    for (const node of nodes) {
        if (!node.children?.length) {
            continue;
        }

        if (node.value.trim() !== '') {
            keys.push(node.value);
        }

        keys.push(...collectExpandableKeys(node.children));
    }

    return keys;
}

function findNode(
    nodes: FieldTreeOptionRow[],
    value: string,
): FieldTreeOptionRow | null {
    for (const node of nodes) {
        if (node.value === value) {
            return node;
        }

        if (node.children?.length) {
            const found = findNode(node.children, value);

            if (found) {
                return found;
            }
        }
    }

    return null;
}

/** Ancestor chain from root parent to nearest parent (caller reverses for sync). */
function findAncestors(
    nodes: FieldTreeOptionRow[],
    value: string,
    trail: FieldTreeOptionRow[] = [],
): FieldTreeOptionRow[] | null {
    for (const node of nodes) {
        if (node.value === value) {
            return trail;
        }

        if (node.children?.length) {
            const found = findAncestors(node.children, value, [
                ...trail,
                node,
            ]);

            if (found) {
                return found;
            }
        }
    }

    return null;
}

/**
 * Cascade toggle like Ant Design Tree (checkStrictly=false):
 * check adds node + all descendants; uncheck clears them;
 * ancestors become fully checked only when every descendant is selected.
 */
export function cascadeToggleValues(
    nodes: FieldTreeOptionRow[],
    selected: string[],
    targetValue: string,
    checked: boolean,
): string[] {
    const target = findNode(nodes, targetValue);

    if (!target) {
        return selected;
    }

    const next = new Set(selected);
    const subtree = [targetValue, ...collectDescendantValues(target)].filter(
        (value) => value.trim() !== '',
    );

    for (const value of subtree) {
        if (checked) {
            next.add(value);
        } else {
            next.delete(value);
        }
    }

    // Nearest parent first so intermediate nodes are in `next` before grandparents check.
    const ancestors = [...(findAncestors(nodes, targetValue) ?? [])].reverse();

    for (const ancestor of ancestors) {
        const descendants = collectDescendantValues(ancestor).filter(
            (value) => value.trim() !== '',
        );
        const allSelected =
            descendants.length > 0 &&
            descendants.every((value) => next.has(value));

        if (allSelected) {
            next.add(ancestor.value);
        } else {
            next.delete(ancestor.value);
        }
    }

    return [...next];
}

export type TreeCheckState = boolean | 'indeterminate';

/** Checked / indeterminate / unchecked for cascade display. */
export function getTreeNodeCheckState(
    node: FieldTreeOptionRow,
    selected: ReadonlySet<string> | readonly string[],
): TreeCheckState {
    const selectedSet =
        selected instanceof Set ? selected : new Set(selected);
    const descendants = collectDescendantValues(node).filter(
        (value) => value.trim() !== '',
    );

    if (descendants.length === 0) {
        return selectedSet.has(node.value);
    }

    const selectedCount = descendants.filter((value) =>
        selectedSet.has(value),
    ).length;

    if (selectedCount === descendants.length) {
        return true;
    }

    if (selectedCount > 0) {
        return 'indeterminate';
    }

    return selectedSet.has(node.value);
}
