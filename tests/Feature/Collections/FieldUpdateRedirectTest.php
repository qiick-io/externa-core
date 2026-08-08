<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('updating a field from an item page redirects back to that item url', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'headline',
        'type' => FieldTypeEnum::String,
        'settings' => [
            'required' => '0',
            'note' => ['en' => 'Before'],
        ],
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $itemUrl = route('collections.items.show', [$collection, $item]);

    $this->from($itemUrl)
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'headline',
            'type' => FieldTypeEnum::String->value,
            'settings' => [
                'input_type' => 'string',
                'required' => '0',
                'note' => ['en' => 'After from item'],
            ],
        ])
        ->assertRedirect($itemUrl);

    expect($field->fresh()->settings['note']['en'] ?? null)->toBe('After from item');
});

test('updating a field without referer falls back to fields index', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'headline',
        'type' => FieldTypeEnum::String,
        'settings' => ['required' => '0'],
    ]);

    $this->patch(route('collections.fields.update', [$collection, $field]), [
        'name' => 'headline',
        'type' => FieldTypeEnum::String->value,
        'settings' => [
            'input_type' => 'string',
            'required' => '1',
        ],
    ])->assertRedirect(route('collections.fields.index', $collection));
});
