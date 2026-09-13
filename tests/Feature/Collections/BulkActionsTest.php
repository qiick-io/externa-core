<?php

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('authorized users can bulk soft-delete collections', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $keep = Collection::factory()->create(['name' => 'Keep']);
    $a = Collection::factory()->create(['name' => 'Bulk A']);
    $b = Collection::factory()->create(['name' => 'Bulk B']);

    $this->post(route('collections.bulk'), [
        'action' => 'delete',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(Collection::query()->whereKey($keep->id)->exists())->toBeTrue()
        ->and(Collection::query()->whereKey($a->id)->exists())->toBeFalse()
        ->and(Collection::query()->whereKey($b->id)->exists())->toBeFalse()
        ->and(Collection::onlyTrashed()->whereKey($a->id)->exists())->toBeTrue()
        ->and(Collection::onlyTrashed()->whereKey($b->id)->exists())->toBeTrue();
});

test('authorized users can bulk restore and force-delete collections', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $a = Collection::factory()->create(['name' => 'Trash A']);
    $b = Collection::factory()->create(['name' => 'Trash B']);
    $a->delete();
    $b->delete();

    $this->post(route('collections.bulk'), [
        'action' => 'restore',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(Collection::query()->whereKey([$a->id, $b->id])->count())->toBe(2);

    $a->delete();
    $b->delete();

    $this->post(route('collections.bulk'), [
        'action' => 'force_delete',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(Collection::withTrashed()->whereKey([$a->id, $b->id])->count())->toBe(0);
});

test('users without delete permission cannot bulk-delete collections', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.bulk'), [
        'action' => 'delete',
        'ids' => [$collection->id],
    ])->assertForbidden();

    expect(Collection::query()->whereKey($collection->id)->exists())->toBeTrue();
});

test('authorized users can bulk soft-delete restore and force-delete items', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $keep = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $a = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $b = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $this->post(route('collections.items.bulk', $collection), [
        'action' => 'delete',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(CollectionItem::query()->whereKey($keep->id)->exists())->toBeTrue()
        ->and(CollectionItem::query()->whereKey($a->id)->exists())->toBeFalse()
        ->and(CollectionItem::onlyTrashed()->whereKey([$a->id, $b->id])->count())->toBe(2);

    $this->post(route('collections.items.bulk', $collection), [
        'action' => 'restore',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(CollectionItem::query()->whereKey([$a->id, $b->id])->count())->toBe(2);

    $a->delete();
    $b->delete();

    $this->post(route('collections.items.bulk', $collection), [
        'action' => 'force_delete',
        'ids' => [$a->id, $b->id],
    ])->assertRedirect();

    expect(CollectionItem::withTrashed()->whereKey([$a->id, $b->id])->count())->toBe(0);
});

test('users without delete permission cannot bulk-delete items', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $this->post(route('collections.items.bulk', $collection), [
        'action' => 'delete',
        'ids' => [$item->id],
    ])->assertForbidden();

    expect(CollectionItem::query()->whereKey($item->id)->exists())->toBeTrue();
});

test('bulk item actions reject ids from another collection', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $other = Collection::factory()->create();
    $foreign = CollectionItem::factory()->create(['collection_id' => $other->id]);

    $this->post(route('collections.items.bulk', $collection), [
        'action' => 'delete',
        'ids' => [$foreign->id],
    ])->assertSessionHasErrors('ids.0');

    expect(CollectionItem::query()->whereKey($foreign->id)->exists())->toBeTrue();
});
