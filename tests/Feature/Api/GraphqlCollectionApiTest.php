<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
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
            'action' => CollectionPermissionAction::Read->value,
        ],
        ['allowed' => true, 'rules' => null],
    );
    app(CollectionPermissionGuard::class)->forget($role->id);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['title' => 'Hi'], true),
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
