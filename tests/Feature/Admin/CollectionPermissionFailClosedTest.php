<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Inertia\Testing\AssertableInertia;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * @param  list<CollectionPermissionActionEnum|string>  $actions
 */
function failClosedGrant(Role $role, Collection $collection, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionActionEnum ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $value,
            ],
            [
                'allowed' => true,
                'rules' => null,
            ],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);
}

/**
 * ACL-scoped editor: always has a grant on $home so Spatie-only unrestricted path is off.
 *
 * @param  list<CollectionPermissionActionEnum|string>  $grantsOnTarget
 * @return array{0: User, 1: Collection, 2: Collection, 3: CollectionItem}
 */
function failClosedEditor(array $grantsOnTarget): array
{
    $home = Collection::query()->create([
        'name' => 'Blog',
        'slug' => 'blog-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    $target = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $home->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $target->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = CollectionItem::factory()->create(['collection_id' => $target->id]);

    $role = Role::query()->create([
        'name' => 'blog-editor-'.uniqid(),
        'guard_name' => 'web',
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    ]);

    // Home grant keeps the actor ACL-scoped even when target has no grant.
    failClosedGrant($role, $home, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);
    if ($grantsOnTarget !== []) {
        failClosedGrant($role, $target, $grantsOnTarget);
    }

    $user = User::factory()->create();
    $user->assignRole($role);

    return [$user, $home, $target, $item];
}

dataset('admin fail-closed operations', function () {
    return [
        'list deny without grant' => ['list', [], 403],
        'list allow with read' => ['list', [CollectionPermissionActionEnum::Read], 200],
        'export deny without grant' => ['export', [], 403],
        'export allow with read' => ['export', [CollectionPermissionActionEnum::Read], 200],
        'update deny read-only' => ['update', [CollectionPermissionActionEnum::Read], 403],
        'update allow with update' => ['update', [
            CollectionPermissionActionEnum::Read,
            CollectionPermissionActionEnum::Update,
        ], 302],
        'delete deny read-only' => ['delete', [CollectionPermissionActionEnum::Read], 403],
        'delete allow with delete' => ['delete', [
            CollectionPermissionActionEnum::Read,
            CollectionPermissionActionEnum::Delete,
        ], 302],
        'bulk delete deny read-only' => ['bulk_delete', [CollectionPermissionActionEnum::Read], 403],
        'bulk delete allow with delete' => ['bulk_delete', [
            CollectionPermissionActionEnum::Read,
            CollectionPermissionActionEnum::Delete,
        ], 302],
    ];
});

it('fails closed on admin item endpoints for collections without a matching grant', function (
    string $operation,
    array $grantsOnTarget,
    int $expectedStatus,
): void {
    [$user, , $target, $item] = failClosedEditor($grantsOnTarget);

    $response = match ($operation) {
        'list' => $this->actingAs($user)->get(route('collections.items.index', $target)),
        'export' => $this->actingAs($user)->get(route('collections.items.export', [
            'collection' => $target,
            'format' => 'json',
        ])),
        'update' => $this->actingAs($user)->from(route('collections.items.index', $target))->put(
            route('collections.items.update', [
                'collection' => $target,
                'item' => $item,
            ]),
            [
                'data' => ['title' => 'Hijacked'],
            ],
        ),
        'delete' => $this->actingAs($user)->from(route('collections.items.index', $target))->delete(
            route('collections.items.destroy', [
                'collection' => $target,
                'item' => $item,
            ]),
        ),
        'bulk_delete' => $this->actingAs($user)->from(route('collections.items.index', $target))->post(
            route('collections.items.bulk', $target),
            [
                'action' => 'delete',
                'ids' => [$item->id],
            ],
        ),
        default => throw new InvalidArgumentException("Unknown operation {$operation}"),
    };

    $response->assertStatus($expectedStatus);

    if (in_array($operation, ['update', 'delete', 'bulk_delete'], true) && $expectedStatus === 403) {
        expect(CollectionItem::query()->whereKey($item->id)->exists())->toBeTrue();
    }
})->with('admin fail-closed operations');

it('hides collections without Read from the admin collection index', function (): void {
    [$user, $home, $target] = failClosedEditor([]);

    $this->actingAs($user)
        ->get(route('collections.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 1)
            ->where('collections.0.id', $home->id)
            ->where('collections.0.id', fn ($id) => $id !== $target->id));
});

it('keeps Spatie-only admins unrestricted across collections', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Open',
        'slug' => 'open-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $role = Role::query()->create([
        'name' => 'spatie-only-'.uniqid(),
        'guard_name' => 'web',
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    // Intentionally no collection_permissions rows.

    $user = User::factory()->create();
    $user->assignRole($role);

    $this->actingAs($user)
        ->get(route('collections.items.index', $collection))
        ->assertOk();
});
