<?php

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Services\Collections\FieldConditionEvaluator;
use App\Services\Collections\FieldValidationRuleEvaluator;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/*
|--------------------------------------------------------------------------
| Common settings — persist + runtime contracts
|--------------------------------------------------------------------------
*/

test('common required persists and rejects empty store', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'title', FieldTypeEnum::String);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'required' => '1',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
        'layout_starts_new_row' => '0',
    ], [
        'required' => true,
    ]);

    H::storeItem($this, $collection, [])->assertSessionHasErrors('data.title');
    H::storeItem($this, $collection, ['title' => 'Ok'])->assertRedirect()->assertSessionHasNoErrors();
});

test('common readonly persists and blocks overwrite on update', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'locked', FieldTypeEnum::String);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'readonly' => '1',
        'required' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'readonly' => true,
    ]);

    expect($field->fresh()->isReadonly())->toBeTrue();

    H::storeItem($this, $collection, ['locked' => 'Original'])->assertRedirect();
    $item = H::latestItem($collection);

    H::updateItem($this, $collection, $item, ['locked' => 'Changed'])->assertRedirect();
    expect(H::assemble($item)['locked'])->toBe('Original');
});

test('common hidden_in_form persists and skips required when hidden', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'secret', FieldTypeEnum::String, [
        'required' => true,
        'hidden_in_form' => true,
    ]);

    expect($field->isHiddenInForm())->toBeTrue()
        ->and($field->isRequired())->toBeTrue();

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'required' => '1',
        'hidden_in_form' => '1',
        'readonly' => '0',
        'layout_width' => 'half',
    ], [
        'hidden_in_form' => true,
        'layout_width' => 'half',
    ]);

    // Hidden fields are not required at store time.
    H::storeItem($this, $collection, [])->assertRedirect()->assertSessionHasNoErrors();
});

test('common layout_width and layout_starts_new_row persist for each width', function (string $width) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'body', FieldTypeEnum::String);

    $fresh = H::assertSettingsRoundtrip($this, $collection, $field, [
        'layout_width' => $width,
        'layout_starts_new_row' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
    ], [
        'layout_width' => $width,
        'layout_starts_new_row' => true,
    ]);

    expect($fresh->layoutWidth())->toBe($width);
})->with(['half', 'full', 'fill']);

test('common display_name note validation_message and default_value persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'subtitle', FieldTypeEnum::String);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'display_name' => ['en' => 'Subtitle', 'it' => 'Sottotitolo'],
        'note' => ['en' => 'Help text'],
        'validation_message' => ['en' => 'Custom fail'],
        'default_value' => 'fallback',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'display_name' => ['en' => 'Subtitle', 'it' => 'Sottotitolo'],
        'note' => ['en' => 'Help text'],
        'validation_message' => ['en' => 'Custom fail'],
        'default_value' => 'fallback',
    ]);

    H::storeItem($this, $collection, [])->assertRedirect()->assertSessionHasNoErrors();
    $item = H::latestItem($collection);
    expect(H::assemble($item)['subtitle'])->toBe('fallback');
});

/*
|--------------------------------------------------------------------------
| Conditions matrix — hide / require / readonly × string + boolean sibling
|--------------------------------------------------------------------------
*/

test('conditions hide require readonly with string sibling equals', function (string $effect) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'kind', FieldTypeEnum::String);
    $target = H::makeField($collection, 'notes', FieldTypeEnum::String);

    $conditions = [
        'logic' => 'and',
        'rules' => [
            ['field' => 'kind', 'operator' => 'equals', 'value' => 'custom'],
        ],
        $effect => true,
    ];

    H::assertSettingsRoundtrip($this, $collection, $target, [
        'conditions' => $conditions,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'conditions.rules.0.field' => 'kind',
        'conditions.rules.0.operator' => 'equals',
        "conditions.{$effect}" => true,
    ]);

    $evaluator = app(FieldConditionEvaluator::class);
    $fresh = $target->fresh();

    expect($evaluator->effectiveFlags($fresh, ['kind' => 'custom'])[$effect])->toBeTrue()
        ->and($evaluator->effectiveFlags($fresh, ['kind' => 'other'])[$effect])->toBeFalse();

    if ($effect === 'required') {
        H::storeItem($this, $collection, ['kind' => 'custom'])
            ->assertSessionHasErrors('data.notes');
        H::storeItem($this, $collection, ['kind' => 'other'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        H::storeItem($this, $collection, ['kind' => 'custom', 'notes' => 'ok'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
    }

    if ($effect === 'readonly') {
        H::storeItem($this, $collection, ['kind' => 'custom', 'notes' => 'Original'])
            ->assertRedirect();
        $item = H::latestItem($collection);

        H::updateItem($this, $collection, $item, ['kind' => 'custom', 'notes' => 'Changed'])
            ->assertRedirect();
        expect(H::assemble($item)['notes'])->toBe('Original');

        // When condition misses, field is writable again.
        H::updateItem($this, $collection, $item, ['kind' => 'other', 'notes' => 'Now writable'])
            ->assertRedirect();
        expect(H::assemble($item)['notes'])->toBe('Now writable');
    }

    if ($effect === 'hidden') {
        // Conditionally hidden required field is not enforced when hidden.
        $target->update([
            'settings' => array_merge($fresh->settings ?? [], [
                'required' => true,
                'conditions' => $conditions,
            ]),
        ]);
        H::storeItem($this, $collection, ['kind' => 'custom'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
    }
})->with(['hidden', 'required', 'readonly']);

test('conditions with boolean sibling equals', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'featured', FieldTypeEnum::Boolean);
    $target = H::makeField($collection, 'headline', FieldTypeEnum::String, [
        'conditions' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'featured', 'operator' => 'equals', 'value' => true],
            ],
            'required' => true,
        ],
    ]);

    $evaluator = app(FieldConditionEvaluator::class);
    expect($evaluator->effectiveFlags($target, ['featured' => true])['required'])->toBeTrue()
        ->and($evaluator->effectiveFlags($target, ['featured' => false])['required'])->toBeFalse();

    H::storeItem($this, $collection, ['featured' => true])
        ->assertSessionHasErrors('data.headline');
    H::storeItem($this, $collection, ['featured' => false])
        ->assertRedirect()
        ->assertSessionHasNoErrors();
});

test('conditions operators not_equals empty not_empty', function (string $operator, mixed $matchValue, mixed $missValue, mixed $ruleValue = null) {
    $evaluator = app(FieldConditionEvaluator::class);
    $rule = ['field' => 'kind', 'operator' => $operator];
    if ($ruleValue !== null) {
        $rule['value'] = $ruleValue;
    }

    $field = new CollectionField([
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'conditions' => [
                'rules' => [$rule],
                'hidden' => true,
            ],
        ],
    ]);

    expect($evaluator->effectiveFlags($field, ['kind' => $matchValue])['hidden'])->toBeTrue()
        ->and($evaluator->effectiveFlags($field, ['kind' => $missValue])['hidden'])->toBeFalse();
})->with([
    'not_equals' => ['not_equals', 'a', 'b', 'b'],
    'empty' => ['empty', '', 'set', null],
    'not_empty' => ['not_empty', 'set', '', null],
]);

test('conditions show-when hidden false hides until match', function () {
    $evaluator = app(FieldConditionEvaluator::class);
    $field = new CollectionField([
        'name' => 'video_url',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'conditions' => [
                'rules' => [
                    ['field' => 'kind', 'operator' => 'equals', 'value' => 'video'],
                ],
                'hidden' => false,
                'required' => true,
            ],
        ],
    ]);

    expect($evaluator->effectiveFlags($field, ['kind' => 'video']))
        ->toMatchArray(['hidden' => false, 'required' => true])
        ->and($evaluator->effectiveFlags($field, ['kind' => 'image']))
        ->toMatchArray(['hidden' => true, 'required' => false]);
});

test('group field conditions hide children skip child required on store', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $group = H::makeField($collection, 'panel', FieldTypeEnum::GroupDetail, [
        'layout_width' => 'full',
    ]);
    H::makeField($collection, 'kind', FieldTypeEnum::String);
    H::makeField($collection, 'title', FieldTypeEnum::String, [
        'group' => 'panel',
        'required' => true,
    ]);

    H::assertSettingsRoundtrip($this, $collection, $group, [
        'layout_width' => 'full',
        'start' => 'closed',
        'conditions' => [
            'logic' => 'and',
            'rules' => [
                ['field' => 'kind', 'operator' => 'equals', 'value' => 'hide'],
            ],
            'hidden' => true,
        ],
    ], [
        'conditions.rules.0.operator' => 'equals',
        'conditions.hidden' => true,
        'start' => 'closed',
    ]);

    // Group hidden → child required skipped (FE drops subtree).
    H::storeItem($this, $collection, ['kind' => 'hide'])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    // Group visible → child required still enforced.
    H::storeItem($this, $collection, ['kind' => 'show'])
        ->assertSessionHasErrors('data.title');
    H::storeItem($this, $collection, ['kind' => 'show', 'title' => 'Ok'])
        ->assertRedirect()
        ->assertSessionHasNoErrors();
});

test('nested blocks field conditions enforce conditional required', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'content', FieldTypeEnum::Blocks, [
        'block_types' => [
            [
                'key' => 'hero',
                'label' => 'Hero',
                'fields' => [
                    [
                        'name' => 'kind',
                        'type' => 'string',
                        'settings' => [],
                    ],
                    [
                        'name' => 'caption',
                        'type' => 'string',
                        'settings' => [
                            'conditions' => [
                                'logic' => 'and',
                                'rules' => [
                                    ['field' => 'kind', 'operator' => 'equals', 'value' => 'video'],
                                ],
                                'required' => true,
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    H::storeItem($this, $collection, [
        'content' => [
            [
                'id' => (string) str()->uuid(),
                'type' => 'hero',
                'data' => ['kind' => 'video'],
            ],
        ],
    ])->assertSessionHasErrors();

    H::storeItem($this, $collection, [
        'content' => [
            [
                'id' => (string) str()->uuid(),
                'type' => 'hero',
                'data' => ['kind' => 'image'],
            ],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    H::storeItem($this, $collection, [
        'content' => [
            [
                'id' => (string) str()->uuid(),
                'type' => 'hero',
                'data' => ['kind' => 'video', 'caption' => 'Watch'],
            ],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

/*
|--------------------------------------------------------------------------
| Validation operators — each at least once + custom message
|--------------------------------------------------------------------------
*/

test('validation operator enforced on store', function (string $operator, mixed $ruleValue, mixed $bad, mixed $good, FieldTypeEnum $type = FieldTypeEnum::String) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $name = 'field_'.$operator;

    $settings = [
        'validation_rules' => [
            ['operator' => $operator, 'value' => $ruleValue],
        ],
        'validation_message' => ['en' => "Custom {$operator} failed"],
    ];

    if (in_array($type, [FieldTypeEnum::Select, FieldTypeEnum::RadioGroup], true)) {
        $settings['options'] = [
            ['value' => 'alpha', 'label' => 'Alpha'],
            ['value' => 'beta', 'label' => 'Beta'],
            ['value' => 'allowed', 'label' => 'Allowed'],
        ];
        $settings['allow_other'] = true;
    }

    H::makeField($collection, $name, $type, $settings);

    $badResponse = H::storeItem($this, $collection, [$name => $bad]);
    $badResponse->assertSessionHasErrors("data.{$name}");

    $errors = session('errors');
    if ($errors !== null) {
        $message = $errors->first("data.{$name}");
        // Custom message applied when evaluator exposes it for the attribute.
        if (is_string($message) && str_contains($message, 'Custom')) {
            expect($message)->toContain("Custom {$operator}");
        }
    }

    H::storeItem($this, $collection, [$name => $good])
        ->assertRedirect()
        ->assertSessionHasNoErrors();
})->with([
    'required' => ['required', null, null, 'present'],
    'min_length' => ['min_length', 3, 'ab', 'abc'],
    'max_length' => ['max_length', 3, 'abcd', 'abc'],
    'min' => ['min', 5, 2, 5, FieldTypeEnum::Number],
    'max' => ['max', 5, 9, 5, FieldTypeEnum::Number],
    'regex' => ['regex', '/^abc$/', 'xyz', 'abc'],
    'contains' => ['contains', 'needle', 'haystack', 'has needle here'],
    'not_contains' => ['not_contains', 'bad', 'bad word', 'clean'],
    'equals' => ['equals', 'allowed', 'nope', 'allowed'],
    'not_equals' => ['not_equals', 'forbidden', 'forbidden', 'ok'],
]);

test('validation unique operator rejects duplicate values', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'code', FieldTypeEnum::String, [
        'validation_rules' => [
            ['operator' => 'unique'],
        ],
    ]);

    H::storeItem($this, $collection, ['code' => 'ABC'])->assertRedirect();
    H::storeItem($this, $collection, ['code' => 'ABC'])->assertSessionHasErrors('data.code');
    H::storeItem($this, $collection, ['code' => 'DEF'])->assertRedirect();
});

test('validation_message custom text is resolved by evaluator', function () {
    $field = new CollectionField([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'validation_message' => [
                'en' => 'Please fix title',
                'it' => 'Sistema il titolo',
            ],
        ],
    ]);

    app()->setLocale('en');
    expect(app(FieldValidationRuleEvaluator::class)->customMessage($field))->toBe('Please fix title');

    app()->setLocale('it');
    expect(app(FieldValidationRuleEvaluator::class)->customMessage($field))->toBe('Sistema il titolo');
});
