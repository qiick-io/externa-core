/**
 * Smoke check for group-tree move helpers (mirrors collection-field-groups.ts).
 * Run: node resources/js/lib/collection-field-groups.check.mjs
 */

function getFieldGroupName(field) {
    const group = field.settings?.group;
    return typeof group === 'string' && group.trim() !== '' ? group.trim() : null;
}

function isLayoutGroupType(type) {
    return (
        type === 'group_accordion' ||
        type === 'group_detail' ||
        type === 'group_raw' ||
        type === 'group_tabs'
    );
}

function isPanelContainerType(type) {
    return type === 'group_accordion' || type === 'group_tabs';
}

/** Mirror of collection-field-groups.ts canNestFieldIntoGroup. */
function canNestFieldIntoGroup(_childType, parentType) {
    return isLayoutGroupType(parentType);
}

function fieldsWithGroupOverrides(fields, groups) {
    return fields.map((field) => {
        if (!groups.has(field.id)) return field;
        const group = groups.get(field.id) ?? null;
        if (getFieldGroupName(field) === group) return field;
        const settings = { ...(field.settings ?? {}) };
        if (group === null) delete settings.group;
        else settings.group = group;
        return { ...field, settings };
    });
}

function fieldIsUnderGroupName(field, groupName, groups, byName) {
    let cursor = groups.get(field.id) ?? getFieldGroupName(field);
    for (let depth = 0; depth < 32 && cursor !== null; depth += 1) {
        if (cursor === groupName) return true;
        const parent = byName.get(cursor);
        cursor = parent
            ? (groups.get(parent.id) ?? getFieldGroupName(parent))
            : null;
    }
    return false;
}

function moveSameParentSiblingBlock(fields, groups, activeId, beforeSiblingId) {
    const activeField = fields.find((field) => field.id === activeId);
    if (!activeField) return fields;
    const parentName = groups.get(activeId) ?? getFieldGroupName(activeField);
    const byName = new Map(fields.map((field) => [field.name, field]));
    const subtreeIds = new Set([activeId]);
    for (const field of fields) {
        if (
            field.id !== activeId &&
            fieldIsUnderGroupName(field, activeField.name, groups, byName)
        ) {
            subtreeIds.add(field.id);
        }
    }
    const block = [];
    const rest = [];
    for (const field of fields) {
        if (subtreeIds.has(field.id)) block.push(field);
        else rest.push(field);
    }
    let insertAt = rest.length;
    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex((field) => field.id === beforeSiblingId);
        if (siblingIndex !== -1) insertAt = siblingIndex;
    } else if (parentName !== null) {
        const parentIndex = rest.findIndex((field) => field.name === parentName);
        if (parentIndex !== -1) {
            let lastIndex = parentIndex;
            for (let index = parentIndex + 1; index < rest.length; index += 1) {
                if (fieldIsUnderGroupName(rest[index], parentName, groups, byName)) {
                    lastIndex = index;
                } else break;
            }
            insertAt = lastIndex + 1;
        }
    }
    const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
    const unchanged =
        next.length === fields.length &&
        next.every((field, index) => field.id === fields[index]?.id);
    return unchanged ? fields : next;
}

function buildFieldTree(fields) {
    const byName = new Map();
    for (const field of fields) byName.set(field.name, { field, children: [] });
    const roots = [];
    for (const field of fields) {
        const node = byName.get(field.name);
        const parentName = getFieldGroupName(field);
        if (!parentName) {
            roots.push(node);
            continue;
        }
        const parent = byName.get(parentName);
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
}

function findFieldTreeNodeById(nodes, fieldId) {
    for (const node of nodes) {
        if (node.field.id === fieldId) return node;
        const nested = findFieldTreeNodeById(node.children, fieldId);
        if (nested) return nested;
    }
    return null;
}

function collectFieldTreeIds(node) {
    const ids = [node.field.id];
    for (const child of node.children) ids.push(...collectFieldTreeIds(child));
    return ids;
}

function wouldCreateGroupCycle(fields, activeName, parentName) {
    if (activeName === parentName) return true;
    const byName = new Map(fields.map((field) => [field.name, field]));
    let cursor = parentName;
    const seen = new Set([activeName]);
    while (cursor) {
        if (seen.has(cursor)) return true;
        seen.add(cursor);
        const parent = byName.get(cursor);
        cursor = parent ? getFieldGroupName(parent) : null;
    }
    return false;
}

function moveFieldInGroupTree(fields, groups, activeId, newParentName, beforeSiblingId = null) {
    const activeField = fields.find((field) => field.id === activeId);
    if (!activeField) return { fields, groups };
    const currentParent = groups.get(activeId) ?? getFieldGroupName(activeField);
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
    if (!activeNode) return { fields, groups: nextGroups };

    const subtreeIds = new Set(collectFieldTreeIds(activeNode));
    const subtree = fields.filter((field) => subtreeIds.has(field.id));
    const rest = fields.filter((field) => !subtreeIds.has(field.id));

    let insertAt = rest.length;
    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex((field) => field.id === beforeSiblingId);
        if (siblingIndex !== -1) insertAt = siblingIndex;
    } else if (newParentName !== null) {
        const parentField = rest.find((field) => field.name === newParentName);
        if (parentField) {
            const restTree = buildFieldTree(fieldsWithGroupOverrides(rest, nextGroups));
            const parentNode = findFieldTreeNodeById(restTree, parentField.id);
            const parentOrderedIndex = rest.findIndex((field) => field.id === parentField.id);
            if (parentNode) {
                const descendantIds = new Set(collectFieldTreeIds(parentNode));
                let lastIndex = parentOrderedIndex;
                for (let index = 0; index < rest.length; index += 1) {
                    if (descendantIds.has(rest[index].id)) lastIndex = index;
                }
                insertAt = lastIndex + 1;
            } else if (parentOrderedIndex !== -1) {
                insertAt = parentOrderedIndex + 1;
            }
        }
    }

    return {
        fields: [...rest.slice(0, insertAt), ...subtree, ...rest.slice(insertAt)],
        groups: nextGroups,
    };
}

const fields = [
    { id: 1, name: 'acc', settings: {} },
    { id: 2, name: 'title', settings: {} },
    { id: 3, name: 'detail', settings: {} },
    { id: 4, name: 'body', settings: {} },
];
const groups = new Map([
    [1, null],
    [2, null],
    [3, null],
    [4, null],
]);

let r = moveFieldInGroupTree(fields, groups, 2, 'acc', null);
if (r.groups.get(2) !== 'acc') throw new Error('title group');
if (r.fields.map((f) => f.id).join(',') !== '1,2,3,4') {
    throw new Error('order after nest title');
}

r = moveFieldInGroupTree(r.fields, r.groups, 3, 'acc', null);
r = moveFieldInGroupTree(r.fields, r.groups, 4, 'detail', null);
if (r.groups.get(4) !== 'detail') throw new Error('body group');

const tree = buildFieldTree(fieldsWithGroupOverrides(r.fields, r.groups));
if (tree.length !== 1 || tree[0].field.name !== 'acc') throw new Error('one root');
if (tree[0].children.length !== 2) throw new Error('acc children');
if (tree[0].children[1].children[0].field.name !== 'body') {
    throw new Error('body under detail');
}

r = moveFieldInGroupTree(r.fields, r.groups, 4, null, null);
if (r.groups.get(4) !== null) throw new Error('unnest');

r = moveFieldInGroupTree(r.fields, r.groups, 4, 'detail', null);
r = moveFieldInGroupTree(r.fields, r.groups, 3, 'acc', 2);
if (r.fields.map((f) => f.name).join(',') !== 'acc,detail,body,title') {
    throw new Error('before sibling: ' + r.fields.map((f) => f.name));
}

// Cycle / self-parent must be a no-op
const beforeCycle = r.fields.map((f) => f.name).join(',');
r = moveFieldInGroupTree(r.fields, r.groups, 3, 'detail', null);
if (r.fields.map((f) => f.name).join(',') !== beforeCycle) {
    throw new Error('cycle mutated order');
}
if (r.groups.get(3) !== 'acc') throw new Error('cycle changed group');

if (!isPanelContainerType('group_accordion') || !isPanelContainerType('group_tabs')) {
    throw new Error('isPanelContainerType accordion/tabs');
}
if (isPanelContainerType('group_raw') || isPanelContainerType('group_detail')) {
    throw new Error('isPanelContainerType should exclude raw/detail');
}

// Drag a group block (header + children) from bottom → top among roots.
{
    const rootFields = [
        { id: 1, name: 'alpha', settings: {} },
        { id: 2, name: 'beta', settings: {} },
        { id: 10, name: 'row_group', settings: {} },
        { id: 11, name: 'child_a', settings: { group: 'row_group' } },
        { id: 12, name: 'child_b', settings: { group: 'row_group' } },
    ];
    const rootGroups = new Map([
        [1, null],
        [2, null],
        [10, null],
        [11, 'row_group'],
        [12, 'row_group'],
    ]);
    const movedUp = moveFieldInGroupTree(rootFields, rootGroups, 10, null, 1);
    if (movedUp.fields.map((f) => f.id).join(',') !== '10,11,12,1,2') {
        throw new Error(
            'group block bottom→top: ' + movedUp.fields.map((f) => f.id),
        );
    }
    if (movedUp.groups.get(10) !== null || movedUp.groups.get(11) !== 'row_group') {
        throw new Error('group block parent should stay root / children nested');
    }
    // Same slot again must be a no-op (guards dragOver re-entry).
    const again = moveFieldInGroupTree(
        movedUp.fields,
        movedUp.groups,
        10,
        null,
        1,
    );
    if (again.fields.map((f) => f.id).join(',') !== '10,11,12,1,2') {
        throw new Error('group block same-slot no-op failed');
    }
    if (again.fields !== movedUp.fields) {
        throw new Error('same-parent same-slot must keep fields reference');
    }
}

// Identity: unchanged parent must not clone field objects.
{
    const base = [
        { id: 1, name: 'a', settings: { group: 'g' } },
        { id: 2, name: 'g', settings: {} },
    ];
    const map = new Map([
        [1, 'g'],
        [2, null],
    ]);
    const once = fieldsWithGroupOverrides(base, map);
    if (once[0] !== base[0] || once[1] !== base[1]) {
        throw new Error('fieldsWithGroupOverrides should keep identity');
    }
}

function reorderSiblingNodes(siblings, activeId, beforeSiblingId) {
    const activeIndex = siblings.findIndex((node) => node.field.id === activeId);
    if (activeIndex === -1) return siblings;
    const activeNode = siblings[activeIndex];
    const rest = siblings.filter((node) => node.field.id !== activeId);
    let insertAt = rest.length;
    if (beforeSiblingId !== null) {
        const siblingIndex = rest.findIndex((node) => node.field.id === beforeSiblingId);
        if (siblingIndex !== -1) insertAt = siblingIndex;
    }
    const next = [...rest.slice(0, insertAt), activeNode, ...rest.slice(insertAt)];
    return next.every((node, index) => node === siblings[index]) ? siblings : next;
}

function reorderTreeSiblings(nodes, parentName, activeId, beforeSiblingId) {
    if (parentName === null) {
        return reorderSiblingNodes(nodes, activeId, beforeSiblingId);
    }
    let changed = false;
    const walk = (list) => {
        let listChanged = false;
        const next = list.map((node) => {
            if (node.field.name === parentName) {
                const nextChildren = reorderSiblingNodes(
                    node.children,
                    activeId,
                    beforeSiblingId,
                );
                if (nextChildren === node.children) return node;
                listChanged = true;
                return { field: node.field, children: nextChildren };
            }
            if (node.children.length === 0) return node;
            const nextChildren = walk(node.children);
            if (nextChildren === node.children) return node;
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

{
    const tree = buildFieldTree(
        fieldsWithGroupOverrides(
            [
                { id: 1, name: 'acc', settings: {} },
                { id: 2, name: 'title', settings: { group: 'acc' } },
                { id: 3, name: 'body', settings: { group: 'acc' } },
                { id: 4, name: 'other', settings: {} },
            ],
            new Map([
                [1, null],
                [2, 'acc'],
                [3, 'acc'],
                [4, null],
            ]),
        ),
    );
    const otherNode = tree[1];
    const reordered = reorderTreeSiblings(tree, 'acc', 3, 2);
    if (reordered[1] !== otherNode) {
        throw new Error('reorderTreeSiblings must keep untouched root identity');
    }
    if (reordered[0].children.map((n) => n.field.name).join(',') !== 'body,title') {
        throw new Error('reorderTreeSiblings child order');
    }
}

{
    // Directus: any nest under a layout group; only refuse non-group parents.
    const cases = [
        ['string', 'group_raw', true],
        ['group_raw', 'group_raw', true],
        ['group_tabs', 'group_detail', true],
        ['group_raw', 'group_accordion', true],
        ['string', 'group_tabs', true],
        ['group_detail', 'group_accordion', true],
        ['group_tabs', 'group_tabs', true],
        ['group_accordion', 'group_tabs', true],
        ['group_raw', 'string', false],
    ];
    for (const [child, parent, ok] of cases) {
        if (canNestFieldIntoGroup(child, parent) !== ok) {
            throw new Error(`canNest ${child}→${parent} expected ${ok}`);
        }
    }
}

console.log('OK moveFieldInGroupTree');
