<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionFormLayoutNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\FieldConditionEvaluator;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('form layout persists on collection and normalizes field ids', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $title = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $status = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
    ]);

    $response = $this->put(route('collections.form-layout.update', $collection), [
        'form_layout' => [
            'version' => 1,
            'tabs' => [
                ['id' => 'main', 'label' => ['en' => 'Main']],
            ],
            'sections' => [
                [
                    'id' => 'details',
                    'tab_id' => 'main',
                    'label' => ['en' => 'Details'],
                    'collapsible' => true,
                    'collapsed' => false,
                    'field_ids' => [$title->id, $status->id, 99999],
                ],
            ],
        ],
    ]);

    $response->assertRedirect()->assertSessionHasNoErrors();

    $collection->refresh();
    expect($collection->form_layout)->toMatchArray([
        'version' => 1,
        'tabs' => [
            ['id' => 'main', 'label' => ['en' => 'Main']],
        ],
        'sections' => [
            [
                'id' => 'details',
                'tab_id' => 'main',
                'label' => ['en' => 'Details'],
                'collapsible' => true,
                'collapsed' => false,
                'field_ids' => [$title->id, $status->id],
            ],
        ],
    ]);

    $groups = app(CollectionFormLayoutNormalizer::class)->resolveRenderGroups(
        $collection->form_layout,
        $collection,
    );

    expect($groups)->toHaveCount(1)
        ->and($groups[0]['field_ids'])->toBe([$title->id, $status->id]);
});

test('conditional required is enforced when rules match', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'kind',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'options' => [
                ['value' => 'simple', 'label' => 'Simple'],
                ['value' => 'custom', 'label' => 'Custom'],
            ],
        ],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'conditions' => [
                'logic' => 'and',
                'rules' => [
                    ['field' => 'kind', 'operator' => 'equals', 'value' => 'custom'],
                ],
                'required' => true,
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'kind' => 'custom',
        ],
    ])->assertSessionHasErrors('data.notes');

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'kind' => 'simple',
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $this->post(route('collections.items.store', $collection), [
        'data' => [
            'kind' => 'custom',
            'notes' => 'Required when custom',
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('field condition evaluator matches equals empty and not_empty', function () {
    $evaluator = app(FieldConditionEvaluator::class);
    $field = new CollectionField([
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'required' => false,
            'conditions' => [
                'logic' => 'and',
                'rules' => [
                    ['field' => 'kind', 'operator' => 'equals', 'value' => 'x'],
                ],
                'required' => true,
            ],
        ],
    ]);

    expect($evaluator->effectiveFlags($field, ['kind' => 'x'])['required'])->toBeTrue()
        ->and($evaluator->effectiveFlags($field, ['kind' => 'y'])['required'])->toBeFalse();

    $emptyField = new CollectionField([
        'name' => 'notes',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'conditions' => [
                'rules' => [
                    ['field' => 'kind', 'operator' => 'empty'],
                ],
                'hidden' => true,
            ],
        ],
    ]);

    expect($evaluator->effectiveFlags($emptyField, ['kind' => ''])['hidden'])->toBeTrue()
        ->and($evaluator->effectiveFlags($emptyField, ['kind' => 'set'])['hidden'])->toBeFalse();

    $showWhen = new CollectionField([
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

    expect($evaluator->effectiveFlags($showWhen, ['kind' => 'video']))
        ->toMatchArray(['hidden' => false, 'required' => true])
        ->and($evaluator->effectiveFlags($showWhen, ['kind' => 'image']))
        ->toMatchArray(['hidden' => true, 'required' => false]);
});

test('select allow_other accepts values outside options', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::Select,
        'settings' => [
            'allow_other' => true,
            'options' => [
                ['value' => 'draft', 'label' => 'Draft'],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['status' => 'custom-status'],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
    expect($assembled['status'])->toBe('custom-status');
});

test('multiselect rejects unknown values when allow_other is false', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'tags',
        'type' => FieldTypeEnum::Multiselect,
        'settings' => [
            'allow_other' => false,
            'options' => [
                ['value' => 'a', 'label' => 'A'],
                ['value' => 'b', 'label' => 'B'],
            ],
        ],
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['tags' => ['a', 'nope']],
    ])->assertSessionHasErrors('data.tags.1');

    $this->post(route('collections.items.store', $collection), [
        'data' => ['tags' => ['a', 'b']],
    ])->assertRedirect()->assertSessionHasNoErrors();
});

test('date field settings accept date_mode values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'published_at',
        'type' => 'date',
        'settings' => [
            'date_mode' => 'date',
            'include_seconds' => false,
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'published_at')
        ->first();

    expect($field)->not->toBeNull()
        ->and(data_get($field->settings, 'date_mode'))->toBe('date')
        ->and(array_key_exists('use_24h', $field->settings ?? []))->toBeFalse();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['published_at' => '2026-07-23'],
    ])->assertRedirect()->assertSessionHasNoErrors();
});
