// ponytail: self-check — run: node --experimental-strip-types resources/js/lib/checkbox-group-tree.check.ts
import assert from 'node:assert/strict';

import {
    cascadeToggleValues,
    getTreeNodeCheckState,
} from './checkbox-group-tree.ts';
import type { FieldTreeOptionRow } from './collection-field-types/catalog.ts';

const tree: FieldTreeOptionRow[] = [
    {
        value: 'a',
        label: 'A',
        children: [
            { value: 'a1', label: 'A1' },
            {
                value: 'a2',
                label: 'A2',
                children: [
                    { value: 'a2x', label: 'A2X' },
                    { value: 'a2y', label: 'A2Y' },
                ],
            },
        ],
    },
];

let selected = cascadeToggleValues(tree, [], 'a', true);
assert.deepEqual(selected.sort(), ['a', 'a1', 'a2', 'a2x', 'a2y'].sort());

selected = cascadeToggleValues(tree, selected, 'a2x', false);
assert.ok(!selected.includes('a'));
assert.ok(!selected.includes('a2'));
assert.ok(selected.includes('a1'));
assert.ok(selected.includes('a2y'));
assert.equal(getTreeNodeCheckState(tree[0]!, selected), 'indeterminate');
assert.equal(
    getTreeNodeCheckState(tree[0]!.children![1]!, selected),
    'indeterminate',
);

selected = cascadeToggleValues(tree, selected, 'a2x', true);
assert.deepEqual(selected.sort(), ['a', 'a1', 'a2', 'a2x', 'a2y'].sort());

selected = cascadeToggleValues(tree, selected, 'a', false);
assert.deepEqual(selected, []);

console.log('checkbox-group-tree self-check ok');
