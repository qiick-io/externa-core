<?php

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Services\Collections\FieldConditionEvaluator;
use App\Services\Collections\FieldValidationRuleEvaluator;

test('FieldValidationRuleEvaluator maps every operator', function (string $operator, mixed $value, int $minRules) {
    $field = new CollectionField([
        'name' => 'x',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'validation_rules' => [
                ['operator' => $operator, 'value' => $value],
            ],
        ],
    ]);

    $rules = app(FieldValidationRuleEvaluator::class)->rulesForField($field, 'data.x');
    expect(count($rules))->toBeGreaterThanOrEqual($minRules);
})->with([
    'required' => ['required', null, 1],
    'unique' => ['unique', null, 1],
    'min_length' => ['min_length', 3, 1],
    'max_length' => ['max_length', 10, 1],
    'min' => ['min', 1, 1],
    'max' => ['max', 9, 1],
    'regex' => ['regex', '/^a+$/', 1],
    'contains' => ['contains', 'x', 1],
    'not_contains' => ['not_contains', 'y', 1],
    'equals' => ['equals', 'z', 1],
    'not_equals' => ['not_equals', 'z', 1],
    'unknown drops' => ['nope', null, 0],
]);

test('FieldConditionEvaluator and/or rulesMatch equals chain', function () {
    $evaluator = app(FieldConditionEvaluator::class);
    $field = new CollectionField([
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'required' => false,
            'conditions' => [
                'logic' => 'and',
                'rules' => [
                    ['field' => 'a', 'operator' => 'equals', 'value' => '1'],
                    ['field' => 'b', 'operator' => 'equals', 'value' => '2'],
                ],
                'required' => true,
            ],
        ],
    ]);

    expect($evaluator->effectiveFlags($field, ['a' => '1', 'b' => '2'])['required'])->toBeTrue()
        ->and($evaluator->effectiveFlags($field, ['a' => '1', 'b' => '9'])['required'])->toBeFalse();
});

test('FieldConditionEvaluator withoutReadonlyFields strips conditional readonly', function () {
    $evaluator = app(FieldConditionEvaluator::class);
    $locked = new CollectionField([
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'conditions' => [
                'rules' => [
                    ['field' => 'kind', 'operator' => 'equals', 'value' => 'lock'],
                ],
                'readonly' => true,
            ],
        ],
    ]);
    $open = new CollectionField([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => [],
    ]);

    $stripped = $evaluator->withoutReadonlyFields(
        [$locked, $open],
        ['kind' => 'lock', 'notes' => 'new', 'title' => 't'],
        ['notes' => 'new', 'title' => 't'],
    );

    expect($stripped)->toBe(['title' => 't']);
});

/**
 * Shared PHP↔TS parity fixtures (#45). Keep in sync with resources/js/lib/field-conditions.test.ts.
 *
 * @return list<array{0: string, 1: list<array<string, mixed>>, 2: array<string, mixed>, 3: bool}>
 */
function fieldConditionParityCases(): array
{
    return [
        'and equals match' => [
            'and',
            [
                ['field' => 'a', 'operator' => 'equals', 'value' => '1'],
                ['field' => 'b', 'operator' => 'equals', 'value' => '2'],
            ],
            ['a' => '1', 'b' => '2'],
            true,
        ],
        'and equals miss' => [
            'and',
            [
                ['field' => 'a', 'operator' => 'equals', 'value' => '1'],
                ['field' => 'b', 'operator' => 'equals', 'value' => '2'],
            ],
            ['a' => '1', 'b' => '9'],
            false,
        ],
        'or equals one hit' => [
            'or',
            [
                ['field' => 'a', 'operator' => 'equals', 'value' => '1'],
                ['field' => 'b', 'operator' => 'equals', 'value' => '2'],
            ],
            ['a' => '9', 'b' => '2'],
            true,
        ],
        'or equals miss' => [
            'or',
            [
                ['field' => 'a', 'operator' => 'equals', 'value' => '1'],
                ['field' => 'b', 'operator' => 'equals', 'value' => '2'],
            ],
            ['a' => '9', 'b' => '9'],
            false,
        ],
        'contains match' => [
            'and',
            [['field' => 'title', 'operator' => 'contains', 'value' => 'hello']],
            ['title' => 'say hello world'],
            true,
        ],
        'contains miss' => [
            'and',
            [['field' => 'title', 'operator' => 'contains', 'value' => 'hello']],
            ['title' => 'goodbye'],
            false,
        ],
        'gt numeric' => [
            'and',
            [['field' => 'n', 'operator' => 'gt', 'value' => '10']],
            ['n' => '11'],
            true,
        ],
        'gte equal' => [
            'and',
            [['field' => 'n', 'operator' => 'gte', 'value' => '10']],
            ['n' => '10'],
            true,
        ],
        'lt miss' => [
            'and',
            [['field' => 'n', 'operator' => 'lt', 'value' => '10']],
            ['n' => '10'],
            false,
        ],
        'lte date' => [
            'and',
            [['field' => 'd', 'operator' => 'lte', 'value' => '2026-09-24']],
            ['d' => '2026-09-23'],
            true,
        ],
        'in list' => [
            'and',
            [['field' => 'status', 'operator' => 'in', 'value' => 'draft, published']],
            ['status' => 'published'],
            true,
        ],
        'not_in list' => [
            'and',
            [['field' => 'status', 'operator' => 'not_in', 'value' => 'draft, archived']],
            ['status' => 'published'],
            true,
        ],
        'empty' => [
            'and',
            [['field' => 'notes', 'operator' => 'empty']],
            ['notes' => '  '],
            true,
        ],
        'not_empty array' => [
            'and',
            [['field' => 'tags', 'operator' => 'not_empty']],
            ['tags' => ['a']],
            true,
        ],
    ];
}

test('FieldConditionEvaluator parity fixtures', function (string $logic, array $rules, array $data, bool $expected) {
    $evaluator = app(FieldConditionEvaluator::class);

    expect($evaluator->rulesMatch($rules, $data, $logic))->toBe($expected);
})->with(fieldConditionParityCases());

test('FieldConditionEvaluator normalizeSettings keeps or and new operators', function () {
    $evaluator = app(FieldConditionEvaluator::class);

    $normalized = $evaluator->normalizeSettings([
        'logic' => 'or',
        'rules' => [
            ['field' => 'n', 'operator' => 'gte', 'value' => '5'],
            ['field' => 'status', 'operator' => 'in', 'value' => ['a', 'b']],
            ['field' => 'x', 'operator' => 'bogus', 'value' => '1'],
        ],
        'required' => true,
    ]);

    expect($normalized)->toMatchArray([
        'logic' => 'or',
        'required' => true,
    ])
        ->and($normalized['rules'][0])->toMatchArray(['field' => 'n', 'operator' => 'gte', 'value' => '5'])
        ->and($normalized['rules'][1])->toMatchArray(['field' => 'status', 'operator' => 'in', 'value' => 'a, b'])
        ->and($normalized['rules'][2]['operator'])->toBe('equals');
});
