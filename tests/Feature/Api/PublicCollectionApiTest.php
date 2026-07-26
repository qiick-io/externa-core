<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

function publicRole(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

/**
 * @param  list<CollectionPermissionAction|string>  $actions
 */
function grantRoleActions(Role $role, Collection $collection, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof CollectionPermissionAction ? $action->value : $action;
        CollectionPermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'collection_id' => $collection->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(CollectionPermissionGuard::class)->forget($role->id);
}

/**
 * @param  list<CollectionPermissionAction|string>  $actions
 */
function grantPublicActions(Collection $collection, array $actions): void
{
    grantRoleActions(publicRole(), $collection, $actions);
}

function makePostsCollection(): Collection
{
    return Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
}

/**
 * @return array{role: Role, plain: string, key: ApiKey}
 */
function makeApiKeyForRole(?Role $role = null): array
{
    $role ??= Role::query()->create([
        'name' => 'api-consumer-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $secret = ApiKey::generateSecret();
    $key = ApiKey::query()->create([
        'name' => 'Partner',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
    ]);

    return ['role' => $role, 'plain' => $secret['plain'], 'key' => $key];
}

it('denies anonymous collection list by default', function (): void {
    makePostsCollection();

    $this->getJson('/api/v1/collections')->assertOk()->assertJsonPath('data', []);
});

it('allows anonymous read when public role has read grant', function (): void {
    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $this->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts']);

    $this->getJson('/api/v1/collections/posts')
        ->assertOk()
        ->assertJsonPath('data.slug', 'posts');
});

it('rejects create without public create grant', function (): void {
    $collection = makePostsCollection();
    grantPublicActions($collection, [CollectionPermissionAction::Read]);

    $this->postJson('/api/v1/collections/posts/items', ['data' => []])
        ->assertForbidden();
});

it('enforces each public permission independently across item endpoints', function (): void {
    $collection = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    // No grants: read endpoints blocked, mutations blocked
    $this->getJson('/api/v1/collections/posts')->assertForbidden();
    $this->getJson('/api/v1/collections/posts/items')->assertForbidden();
    $this->getJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();
    $this->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $this->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertForbidden();
    $this->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();

    // Read only
    grantPublicActions($collection, [CollectionPermissionAction::Read]);
    $this->getJson('/api/v1/collections/posts')->assertOk();
    $this->getJson('/api/v1/collections/posts/items')->assertOk();
    $this->getJson("/api/v1/collections/posts/items/{$item->id}")->assertOk();
    $this->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $this->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertForbidden();
    $this->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();

    // Create
    grantPublicActions($collection, [CollectionPermissionAction::Create]);
    $this->postJson('/api/v1/collections/posts/items', ['data' => []])
        ->assertCreated()
        ->assertJsonPath('data.collection_id', $collection->id);

    // Update
    grantPublicActions($collection, [CollectionPermissionAction::Update]);
    $this->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])
        ->assertOk()
        ->assertJsonPath('data.id', $item->id);

    // Delete
    grantPublicActions($collection, [CollectionPermissionAction::Delete]);
    $this->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertNoContent();
    expect(CollectionItem::query()->find($item->id))->toBeNull();
});

it('authenticates with api key and enforces ip allowlist', function (): void {
    $collection = makePostsCollection();
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Read]);

    $auth['key']->update(['ip_allowlist' => ['203.0.113.10']]);

    $this->withToken($auth['plain'])
        ->getJson('/api/v1/collections')
        ->assertUnauthorized();

    $this->withToken($auth['plain'])
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
        ->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts']);
});

it('api key role grants gate each item endpoint independently', function (): void {
    $collection = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $auth = makeApiKeyForRole();
    $token = $auth['plain'];

    $asKey = fn () => $this->withToken($token);

    // No grants on key role (public may also lack grants)
    $asKey()->getJson('/api/v1/collections')->assertOk()->assertJsonPath('data', []);
    $asKey()->getJson('/api/v1/collections/posts')->assertForbidden();
    $asKey()->getJson('/api/v1/collections/posts/items')->assertForbidden();
    $asKey()->getJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();
    $asKey()->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $asKey()->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertForbidden();
    $asKey()->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();

    // Read
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Read]);
    $asKey()->getJson('/api/v1/collections')->assertOk()->assertJsonFragment(['slug' => 'posts']);
    $asKey()->getJson('/api/v1/collections/posts')->assertOk();
    $asKey()->getJson('/api/v1/collections/posts/items')->assertOk();
    $asKey()->getJson("/api/v1/collections/posts/items/{$item->id}")->assertOk();
    $asKey()->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $asKey()->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertForbidden();
    $asKey()->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertForbidden();

    // Create (keep read so list still works)
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Create]);
    $created = $asKey()->postJson('/api/v1/collections/posts/items', ['data' => []])
        ->assertCreated()
        ->json('data.id');
    expect($created)->toBeInt();

    // Update
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Update]);
    $asKey()->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])
        ->assertOk()
        ->assertJsonPath('data.id', $item->id);

    // Delete
    grantRoleActions($auth['role'], $collection, [CollectionPermissionAction::Delete]);
    $asKey()->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertNoContent();
    expect(CollectionItem::query()->find($item->id))->toBeNull();
});

it('api key with full grants can use all endpoints while another key without grants stays blocked', function (): void {
    $collection = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $full = makeApiKeyForRole();
    grantRoleActions($full['role'], $collection, [
        CollectionPermissionAction::Create,
        CollectionPermissionAction::Read,
        CollectionPermissionAction::Update,
        CollectionPermissionAction::Delete,
    ]);

    $blocked = makeApiKeyForRole();

    $this->withToken($full['plain'])->getJson('/api/v1/collections')->assertOk()->assertJsonFragment(['slug' => 'posts']);
    $this->withToken($full['plain'])->getJson('/api/v1/collections/posts')->assertOk();
    $this->withToken($full['plain'])->getJson('/api/v1/collections/posts/items')->assertOk();
    $this->withToken($full['plain'])->getJson("/api/v1/collections/posts/items/{$item->id}")->assertOk();
    $this->withToken($full['plain'])->postJson('/api/v1/collections/posts/items', ['data' => []])->assertCreated();
    $this->withToken($full['plain'])->patchJson("/api/v1/collections/posts/items/{$item->id}", ['data' => []])->assertOk();
    $this->withToken($full['plain'])->deleteJson("/api/v1/collections/posts/items/{$item->id}")->assertNoContent();

    $other = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $this->withToken($blocked['plain'])->getJson('/api/v1/collections/posts')->assertForbidden();
    $this->withToken($blocked['plain'])->getJson('/api/v1/collections/posts/items')->assertForbidden();
    $this->withToken($blocked['plain'])->postJson('/api/v1/collections/posts/items', ['data' => []])->assertForbidden();
    $this->withToken($blocked['plain'])->patchJson("/api/v1/collections/posts/items/{$other->id}", ['data' => []])->assertForbidden();
    $this->withToken($blocked['plain'])->deleteJson("/api/v1/collections/posts/items/{$other->id}")->assertForbidden();
});

it('prevents deleting or renaming the public role', function (): void {
    $admin = User::factory()->create();
    $admin->givePermissionTo([
        PermissionEnum::CanEditRoles->value,
        PermissionEnum::CanDeleteRoles->value,
    ]);

    $public = publicRole();

    $this->actingAs($admin)
        ->put(route('roles.update', $public), [
            'name' => 'not-public',
            'collection_permissions' => [],
        ])
        ->assertForbidden();

    $this->actingAs($admin)
        ->delete(route('roles.destroy', $public))
        ->assertForbidden();

    expect($public->fresh()->name)->toBe(RoleEnum::Public->value);
});

it('rejects assigning the public role to a user', function (): void {
    $admin = User::factory()->create();
    $admin->givePermissionTo([
        PermissionEnum::CanCreateUsers->value,
        PermissionEnum::CanEditUsers->value,
    ]);

    $public = publicRole();

    $this->actingAs($admin)
        ->post(route('users.store'), [
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'email' => 'ada@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
            'role_ids' => [$public->id],
        ])
        ->assertSessionHasErrors('role_ids.0');
});
