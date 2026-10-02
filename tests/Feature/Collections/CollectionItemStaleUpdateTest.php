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

/**
 * @return array{user: User, collection: Collection, item: CollectionItem}
 */
function staleUpdateKitchen(): array
{
    $user = grantCollectionPermissions(User::factory()->create());
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

test('item update rejects stale expected_updated_at', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = staleUpdateKitchen();
    $this->actingAs($user);

    $item->touch();
    $stale = $item->updated_at?->copy()->subMinute()?->toIso8601String();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'expected_updated_at' => $stale,
        'data' => ['title' => 'fresh'],
    ])->assertSessionHasErrors('expected_updated_at');
});

test('item update accepts matching expected_updated_at', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = staleUpdateKitchen();
    $this->actingAs($user);

    $expected = $item->fresh()->updated_at?->toIso8601String();

    $this->put(route('collections.items.update', [$collection, $item]), [
        'expected_updated_at' => $expected,
        'data' => ['title' => 'fresh'],
    ])->assertRedirect();
});
