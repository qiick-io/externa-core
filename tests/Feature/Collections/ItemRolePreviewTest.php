<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

test('preview as role strips unreadable fields and reports readable payload', function () {
    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->for($collection)->create([
        'name' => 'secret',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, [
            'title' => 'Hello',
            'secret' => 'hidden',
        ], true),
    );

    $previewRole = Role::query()->create([
        'name' => 'preview-role-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    CollectionPermission::query()->create([
        'role_id' => $previewRole->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionAction::Read->value,
        'allowed' => true,
        'rules' => [
            'fields' => [
                'title' => ['read' => true, 'create' => false, 'update' => false],
                'secret' => ['read' => false, 'create' => false, 'update' => false],
            ],
        ],
    ]);

    $this->getJson(route('collections.items.preview-as-role', [
        'collection' => $collection,
        'item' => $item,
        'role_id' => $previewRole->id,
    ]))
        ->assertOk()
        ->assertJsonPath('readable', true)
        ->assertJsonPath('data.title', 'Hello')
        ->assertJsonMissingPath('data.secret');
});

test('preview as public reports unreadable when public lacks collection read', function () {
    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, [
            'title' => 'Hello',
        ], true),
    );

    $public = Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();

    // Ensure no read grant for this collection on public
    CollectionPermission::query()
        ->where('role_id', $public->id)
        ->where('collection_id', $collection->id)
        ->delete();

    $this->getJson(route('collections.items.preview-as-role', [
        'collection' => $collection,
        'item' => $item,
        'as_public' => 1,
    ]))
        ->assertOk()
        ->assertJsonPath('readable', false)
        ->assertJsonPath('data', null);
});

test('item form includes preview roles excluding the current user role', function () {
    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $this->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/items/form')
            ->has('previewRoles', 3)
            ->where('previewRoles.0.name', RoleEnum::Admin->value)
            ->where('previewRoles.1.name', RoleEnum::Public->value)
            ->where('previewRoles.2.name', RoleEnum::Reader->value)
            ->has('activityLogs'));
});

test('preview as role is forbidden without admin or super-admin', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $this->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/items/form')
            ->has('previewRoles', 0));

    $this->getJson(route('collections.items.preview-as-role', [
        'collection' => $collection,
        'item' => $item,
        'as_public' => 1,
    ]))->assertForbidden();
});
