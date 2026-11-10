<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

test('graphql items query respects collection permissions', function () {
    $collection = Collection::query()->create([
        'name' => 'GPosts',
        'slug' => 'gposts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $role = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
    CollectionPermission::query()->updateOrCreate(
        [
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => CollectionPermissionActionEnum::Read->value,
        ],
        ['allowed' => true, 'rules' => null],
    );
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriterService::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizerService::class)->normalize($collection, ['title' => 'Hi'], true),
    );

    $response = $this->postJson('/api/graphql', [
        'query' => 'query { items(collection: "gposts") { data { id data } meta { total } } }',
    ]);

    $response->assertOk();
    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.items.meta.total'))->toBe(1)
        ->and($response->json('data.items.data.0.data.title'))->toBe('Hi');
});

test('graphql denies items without read grant', function () {
    Collection::query()->create([
        'name' => 'Secret',
        'slug' => 'secret',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    $response = $this->postJson('/api/graphql', [
        'query' => 'query { items(collection: "secret") { data { id } meta { total } } }',
    ]);

    // GraphQL may return 200 with errors or 403 depending on exception handler
    expect(in_array($response->status(), [200, 403], true))->toBeTrue();
    if ($response->status() === 200) {
        expect($response->json('errors'))->not->toBeEmpty();
    }
});

/**
 * Public collection with title field and the given public-role grants.
 *
 * @param  list<CollectionPermissionActionEnum>  $actions
 */
function graphqlDatesCollection(array $actions): Collection
{
    $collection = Collection::query()->create([
        'name' => 'GDates',
        'slug' => 'gdates',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $role = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();

    foreach ($actions as $action) {
        CollectionPermission::query()->updateOrCreate(
            ['role_id' => $role->id, 'collection_id' => $collection->id, 'action' => $action->value],
            ['allowed' => true, 'rules' => null],
        );
    }

    app(CollectionPermissionGuardService::class)->forget($role->id);

    return $collection;
}

test('graphql item query serves created_at and updated_at as DateTime', function () {
    $collection = graphqlDatesCollection([CollectionPermissionActionEnum::Read]);
    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriterService::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizerService::class)->normalize($collection, ['title' => 'Dated'], true),
    );

    $response = $this->postJson('/api/graphql', [
        'query' => 'query ($id: ID!) { item(collection: "gdates", id: $id) { id created_at updated_at } }',
        'variables' => ['id' => (string) $item->id],
    ])->assertOk();

    expect($response->json('errors'))->toBeNull()
        ->and($response->json('data.item.created_at'))->toBe($item->fresh()->created_at->format('Y-m-d H:i:s'))
        ->and($response->json('data.item.updated_at'))->toBe($item->fresh()->updated_at->format('Y-m-d H:i:s'));
});

test('graphql createItem and updateItem return DateTime timestamps', function () {
    graphqlDatesCollection([
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
    ]);

    $created = $this->postJson('/api/graphql', [
        'query' => 'mutation { createItem(collection: "gdates", data: {title: "New"}) { id created_at updated_at } }',
    ])->assertOk();

    expect($created->json('errors'))->toBeNull()
        ->and($created->json('data.createItem.created_at'))->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/');

    $updated = $this->postJson('/api/graphql', [
        'query' => 'mutation ($id: ID!) { updateItem(collection: "gdates", id: $id, data: {title: "Edited"}) { id updated_at } }',
        'variables' => ['id' => $created->json('data.createItem.id')],
    ])->assertOk();

    expect($updated->json('errors'))->toBeNull()
        ->and($updated->json('data.updateItem.updated_at'))->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/');
});
