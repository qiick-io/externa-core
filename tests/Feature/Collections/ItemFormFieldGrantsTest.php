<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Permission;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @param  array{fields?: array<string, array{read: bool, create: bool, update: bool}>, item_filter?: ?array}  $rules
 */
function adminUserWithFieldAcl(Collection $collection, array $rules): User
{
    $role = Role::query()->create([
        'name' => 'field-acl-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    foreach (allCollectionPermissions() as $permission) {
        Permission::query()->firstOrCreate([
            'name' => $permission,
            'guard_name' => 'web',
        ]);
    }

    $role->syncPermissions(allCollectionPermissions());

    foreach ([
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Create,
        CollectionPermissionAction::Update,
        CollectionPermissionAction::Delete,
    ] as $action) {
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $action->value,
            ],
            [
                'allowed' => true,
                'rules' => $rules,
            ],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);

    $user = User::factory()->create();
    $user->syncRoles([$role]);

    return $user;
}

test('item form passes fieldGrants when role has field ACL', function () {
    $collection = Collection::query()->create([
        'name' => 'ACL Posts',
        'slug' => 'acl-posts-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'secret',
        'type' => FieldTypeEnum::String,
    ]);

    $user = adminUserWithFieldAcl($collection, [
        'fields' => [
            'title' => ['read' => true, 'create' => true, 'update' => false],
            'secret' => ['read' => false, 'create' => false, 'update' => false],
        ],
        'item_filter' => null,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize(
            $collection,
            ['title' => 'Hello', 'secret' => 'hidden'],
            true,
        ),
    );

    $this->actingAs($user)
        ->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('fieldGrants.title.read', true)
            ->where('fieldGrants.title.update', false)
            ->where('fieldGrants.secret.read', false));

    $this->actingAs($user)
        ->get(route('collections.items.new', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('isNew', true)
            ->where('fieldGrants.title.create', true));
});

test('item form fieldGrants is null for Spatie-only admin without collection grants', function () {
    $collection = Collection::query()->create([
        'name' => 'Open Posts',
        'slug' => 'open-posts-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $user = grantCollectionPermissions(User::factory()->create());

    $this->actingAs($user)
        ->get(route('collections.items.new', $collection))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/form')
            ->where('fieldGrants', null));
});
