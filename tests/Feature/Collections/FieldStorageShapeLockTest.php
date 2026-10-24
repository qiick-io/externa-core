<?php

declare(strict_types=1);

use App\Ai\Tools\ManageCollections;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function fieldWithPublishedValue(): array
{
    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'headline',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);
    CollectionItemValue::query()->create([
        'item_id' => $item->id,
        'field_id' => $field->id,
        'locale' => null,
        'position' => 0,
        'value' => 'KEEP ME',
    ]);

    return compact('collection', 'field', 'item');
}

test('admin rejects type change when field has published values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();

    $this->actingAs($user)
        ->from(route('collections.fields.index', $collection))
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'headline',
            'type' => FieldTypeEnum::Number->value,
        ])
        ->assertRedirect()
        ->assertSessionHasErrors('type');

    expect($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('admin rejects translatable flip when field has published values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();

    $this->actingAs($user)
        ->from(route('collections.fields.index', $collection))
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'headline',
            'type' => FieldTypeEnum::String->value,
            'translatable' => '1',
        ])
        ->assertRedirect()
        ->assertSessionHasErrors('translatable');

    expect($field->fresh()->translatable)->toBeFalse();
});

test('admin allows same-type submit when field has values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();

    $this->actingAs($user)
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'headline',
            'type' => FieldTypeEnum::String->value,
            'settings' => [
                'input_type' => 'string',
                'required' => '1',
            ],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($field->fresh()->settings['required'] ?? null)->toBe('1');
});

test('admin allows type change when field has no values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'empty_field',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $this->actingAs($user)
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'empty_field',
            'type' => FieldTypeEnum::Number->value,
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($field->fresh()->type)->toBe(FieldTypeEnum::Number);
});

test('draft_data alone counts as stored values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'draft_data' => ['title' => 'Draft only'],
    ]);

    $this->actingAs($user)
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'title',
            'type' => FieldTypeEnum::Number->value,
        ])
        ->assertSessionHasErrors('type');

    expect($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('soft-deleted item values still lock the field', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field, 'item' => $item] = fieldWithPublishedValue();
    $item->delete();

    $this->actingAs($user)
        ->patch(route('collections.fields.update', [$collection, $field]), [
            'name' => 'headline',
            'type' => FieldTypeEnum::Number->value,
        ])
        ->assertSessionHasErrors('type');

    expect($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('AI update_field rejects type change when field has values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();

    $tool = app(ManageCollections::class);
    $result = (string) $tool->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'type' => FieldTypeEnum::Number->value,
    ]));

    expect($result)->toStartWith('Error:')
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('AI update_field rejects translatable flip when field has values', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();

    $tool = app(ManageCollections::class);
    $result = (string) $tool->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'translatable' => true,
    ]));

    expect($result)->toStartWith('Error:')
        ->and($field->fresh()->translatable)->toBeFalse();
});

test('AI update_field allows type change on empty field', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);
    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'empty_ai',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $tool = app(ManageCollections::class);
    $result = (string) $tool->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'type' => FieldTypeEnum::Number->value,
    ]));

    $payload = json_decode($result, true);
    expect($payload['ok'] ?? false)->toBeTrue()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::Number);
});

test('fields index exposes has_stored_values for the UI lock', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field] = fieldWithPublishedValue();
    $empty = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'empty_ui',
        'type' => FieldTypeEnum::String,
    ]);

    $this->actingAs($user)
        ->get(route('collections.fields.index', $collection))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/collections/fields')
            ->has('collection.fields', 2)
            ->where('collection.fields', function ($fields) use ($field, $empty): bool {
                $byId = collect($fields)->keyBy('id');

                return ($byId[$field->id]['has_stored_values'] ?? false) === true
                    && ($byId[$empty->id]['has_stored_values'] ?? true) === false;
            })
        );
});
