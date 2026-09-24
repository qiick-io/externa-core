import assert from 'node:assert/strict';
import test from 'node:test';
import {
    evaluateFieldFlags,
    parseFieldConditions,
} from './field-conditions.ts';

/** Shared PHP↔TS parity fixtures (#45). Keep in sync with FieldSettingsEvaluatorsTest.php. */
const parityCases: {
    name: string;
    logic: 'and' | 'or';
    rules: { field: string; operator: string; value?: unknown }[];
    data: Record<string, unknown>;
    expected: boolean;
}[] = [
    {
        name: 'and equals match',
        logic: 'and',
        rules: [
            { field: 'a', operator: 'equals', value: '1' },
            { field: 'b', operator: 'equals', value: '2' },
        ],
        data: { a: '1', b: '2' },
        expected: true,
    },
    {
        name: 'and equals miss',
        logic: 'and',
        rules: [
            { field: 'a', operator: 'equals', value: '1' },
            { field: 'b', operator: 'equals', value: '2' },
        ],
        data: { a: '1', b: '9' },
        expected: false,
    },
    {
        name: 'or equals one hit',
        logic: 'or',
        rules: [
            { field: 'a', operator: 'equals', value: '1' },
            { field: 'b', operator: 'equals', value: '2' },
        ],
        data: { a: '9', b: '2' },
        expected: true,
    },
    {
        name: 'or equals miss',
        logic: 'or',
        rules: [
            { field: 'a', operator: 'equals', value: '1' },
            { field: 'b', operator: 'equals', value: '2' },
        ],
        data: { a: '9', b: '9' },
        expected: false,
    },
    {
        name: 'contains match',
        logic: 'and',
        rules: [{ field: 'title', operator: 'contains', value: 'hello' }],
        data: { title: 'say hello world' },
        expected: true,
    },
    {
        name: 'contains miss',
        logic: 'and',
        rules: [{ field: 'title', operator: 'contains', value: 'hello' }],
        data: { title: 'goodbye' },
        expected: false,
    },
    {
        name: 'gt numeric',
        logic: 'and',
        rules: [{ field: 'n', operator: 'gt', value: '10' }],
        data: { n: '11' },
        expected: true,
    },
    {
        name: 'gte equal',
        logic: 'and',
        rules: [{ field: 'n', operator: 'gte', value: '10' }],
        data: { n: '10' },
        expected: true,
    },
    {
        name: 'lt miss',
        logic: 'and',
        rules: [{ field: 'n', operator: 'lt', value: '10' }],
        data: { n: '10' },
        expected: false,
    },
    {
        name: 'lte date',
        logic: 'and',
        rules: [{ field: 'd', operator: 'lte', value: '2026-09-24' }],
        data: { d: '2026-09-23' },
        expected: true,
    },
    {
        name: 'in list',
        logic: 'and',
        rules: [{ field: 'status', operator: 'in', value: 'draft, published' }],
        data: { status: 'published' },
        expected: true,
    },
    {
        name: 'not_in list',
        logic: 'and',
        rules: [
            { field: 'status', operator: 'not_in', value: 'draft, archived' },
        ],
        data: { status: 'published' },
        expected: true,
    },
    {
        name: 'empty',
        logic: 'and',
        rules: [{ field: 'notes', operator: 'empty' }],
        data: { notes: '  ' },
        expected: true,
    },
    {
        name: 'not_empty array',
        logic: 'and',
        rules: [{ field: 'tags', operator: 'not_empty' }],
        data: { tags: ['a'] },
        expected: true,
    },
];

for (const fixture of parityCases) {
    test(`parity: ${fixture.name}`, () => {
        const flags = evaluateFieldFlags(
            {
                conditions: {
                    logic: fixture.logic,
                    rules: fixture.rules,
                    required: true,
                },
            },
            fixture.data,
        );

        assert.equal(flags.required, fixture.expected);
    });
}

test('parseFieldConditions accepts or + new operators', () => {
    const parsed = parseFieldConditions({
        conditions: {
            logic: 'or',
            rules: [
                { field: 'n', operator: 'gte', value: '5' },
                { field: 'status', operator: 'in', value: 'a, b' },
            ],
            hidden: false,
        },
    });

    assert.ok(parsed);
    assert.equal(parsed.logic, 'or');
    assert.equal(parsed.rules[0]?.operator, 'gte');
    assert.equal(parsed.rules[1]?.operator, 'in');
    assert.equal(parsed.hidden, false);
});

test('show-when still hides when OR rules miss', () => {
    const flags = evaluateFieldFlags(
        {
            conditions: {
                logic: 'or',
                rules: [
                    { field: 'a', operator: 'equals', value: '1' },
                    { field: 'b', operator: 'equals', value: '2' },
                ],
                hidden: false,
            },
        },
        { a: 'x', b: 'y' },
    );

    assert.equal(flags.hidden, true);
});
