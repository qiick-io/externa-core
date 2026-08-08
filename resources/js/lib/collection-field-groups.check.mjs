/**
 * Smoke check for group-tree move helpers (mirrors collection-field-groups.ts).
 * Run: node resources/js/lib/collection-field-groups.check.mjs
 */

function getFieldGroupName(field) {
    const group = field.settings?.group;
    return typeof group === 'string' && group.trim() !== '' ? group.trim() : null;
}

function isPanelContainerType(type) {
    return type === 'group_accordion' || type === 'group_tabs';
}

function fieldsWithGroupOverrides(fields, groups) {
    const map = fields.map((field) => {
        if (!groups.has(field.id)) return field;
        const group = groups.get(field.id) ?? null;
        const settings = { ...(field.settings ?? {}) };
        if (group === null) delete settings.group;
        else settings.group = group;
        return { ...field, settings };
    });
    return map;
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

console.log('OK moveFieldInGroupTree');
