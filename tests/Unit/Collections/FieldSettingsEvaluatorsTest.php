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
