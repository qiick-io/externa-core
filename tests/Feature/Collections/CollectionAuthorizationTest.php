<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    $this->withoutVite();
});

test('verified users without collection permissions get 403 on schema and item writes', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $this->get(route('collections.index'))->assertForbidden();
    $this->get(route('collections.show', $collection))->assertForbidden();
    $this->get(route('collections.items.index', $collection))->assertForbidden();

    $this->post(route('collections.store'), [
        'name' => 'Denied',
        'slug' => 'denied',
    ])->assertForbidden();

    $this->put(route('collections.update', $collection), [
        'name' => 'Denied Update',
        'slug' => $collection->slug,
    ])->assertForbidden();

    $this->delete(route('collections.destroy', $collection))->assertForbidden();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::String->value,
    ])->assertForbidden();

    $this->patch(route('collections.fields.update', [$collection, $field]), [
        'name' => 'title',
        'type' => FieldTypeEnum::String->value,
    ])->assertForbidden();

    $this->delete(route('collections.fields.destroy', [$collection, $field]))->assertForbidden();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Nope'],
    ])->assertForbidden();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'Nope'],
    ])->assertForbidden();

    $this->delete(route('collections.items.destroy', [$collection, $item]))->assertForbidden();
});

test('users with collection permissions can create update and delete schema and items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.store'), [
        'name' => 'Allowed',
        'slug' => 'allowed',
    ])->assertRedirect();

    $collection = Collection::query()->where('slug', 'allowed')->firstOrFail();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'title',
        'type' => FieldTypeEnum::String->value,
    ])->assertRedirect();

    $field = CollectionField::query()->where('collection_id', $collection->id)->firstOrFail();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Hello'],
    ])->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->firstOrFail();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'Hello 2'],
    ])->assertRedirect();

    $this->delete(route('collections.items.destroy', [$collection, $item]))->assertRedirect();
    $this->delete(route('collections.fields.destroy', [$collection, $field]))->assertRedirect();
    $this->delete(route('collections.destroy', $collection))->assertRedirect();
});

test('show-only permission allows reads but blocks writes', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $this->get(route('collections.index'))->assertOk();
    $this->get(route('collections.show', $collection))->assertRedirect(
        route('collections.items.index', $collection),
    );
    $this->get(route('collections.items.index', $collection))->assertOk();

    $this->post(route('collections.store'), [
        'name' => 'Blocked',
        'slug' => 'blocked',
    ])->assertForbidden();

    $this->post(route('collections.fields.store', $collection), [
        'name' => 'body',
        'type' => FieldTypeEnum::String->value,
    ])->assertForbidden();

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Nope'],
    ])->assertForbidden();

    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
    ]);

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'Nope'],
    ])->assertForbidden();

    $this->delete(route('collections.items.destroy', [$collection, $item]))
        ->assertForbidden();
});

test('super admin bypasses collection permission middleware', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->post(route('collections.store'), [
        'name' => 'Super',
        'slug' => 'super',
    ])->assertRedirect();

    expect(Collection::query()->where('slug', 'super')->exists())->toBeTrue();
});
