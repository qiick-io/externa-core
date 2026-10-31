<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\ApiKeyOwnerService;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

/**
 * Owner with a collection ACL role (not Spatie-only unrestricted).
 *
 * @param  list<CollectionPermissionActionEnum|string>  $actions
 * @return array{user: User, role: Role}
 */
function makeAclOwner(Collection $collection, array $actions): array
{
    $role = Role::query()->create([
        'name' => 'owner-acl-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    grantRoleActions($role, $collection, $actions);

    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    return ['user' => $user, 'role' => $role];
}

it('defaults owner_id to the creator when storing an API key', function (): void {
    $creator = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'api-store-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $managerRole = Role::query()->firstOrCreate([
        'name' => 'api-key-manager-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $managerRole->syncPermissions([
        PermissionEnum::CanShowApiKeys->value,
        PermissionEnum::CanManageApiKeys->value,
    ]);
    $creator->syncRoles([$managerRole]);

    $this->actingAs($creator)
        ->post(route('api-keys.store'), [
            'name' => 'Partner key',
            'role_id' => $role->id,
        ])
        ->assertRedirect(route('api-keys.index'));

    $key = ApiKey::query()->where('name', 'Partner key')->first();
    expect($key)->not->toBeNull()
        ->and($key->created_by)->toBe($creator->id)
        ->and($key->owner_id)->toBe($creator->id)
        ->and($key->hasOwner())->toBeTrue();
});

it('backfills owner_id from created_by, else first admin, else leaves ownerless', function (): void {
    $admin = User::factory()->create(['is_active' => true]);
    $admin->assignRole(RoleEnum::Admin->value);

    $creator = User::factory()->create(['is_active' => true]);
    // Soft-deleted creator still occupies created_by FK; backfill must skip deleted_at rows.
    $softDeletedCreator = User::factory()->create(['is_active' => true]);

    $role = Role::query()->create([
        'name' => 'backfill-role-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $withCreator = makeApiKeyForRole($role);
    $withCreator['key']->forceFill([
        'created_by' => $creator->id,
        'owner_id' => null,
    ])->save();

    $orphanCreator = makeApiKeyForRole($role);
    $orphanCreator['key']->forceFill([
        'created_by' => $softDeletedCreator->id,
        'owner_id' => null,
    ])->save();
    $softDeletedCreator->delete();

    $noCreator = makeApiKeyForRole($role);
    $noCreator['key']->forceFill([
        'created_by' => null,
        'owner_id' => null,
    ])->save();

    $service = app(ApiKeyOwnerService::class);
    expect($service->resolveBackfillOwnerId($creator->id))->toBe($creator->id)
        ->and($service->resolveBackfillOwnerId($softDeletedCreator->id))->toBe($admin->id)
        ->and($service->resolveBackfillOwnerId(null))->toBe($admin->id);

    $updated = $service->backfillMissingOwners();
    expect($updated)->toBe(3)
        ->and($withCreator['key']->fresh()->owner_id)->toBe($creator->id)
        ->and($orphanCreator['key']->fresh()->owner_id)->toBe($admin->id)
        ->and($noCreator['key']->fresh()->owner_id)->toBe($admin->id);

    // No admin left → stay ownerless.
    $admin->syncRoles([]);
    app(EffectivePermissionResolver::class)->forget($admin);

    $lonely = makeApiKeyForRole($role);
    $lonely['key']->forceFill([
        'created_by' => null,
        'owner_id' => null,
    ])->save();

    expect($service->firstAdminUserId())->toBeNull()
        ->and($service->backfillMissingOwners())->toBe(0)
        ->and($lonely['key']->fresh()->owner_id)->toBeNull()
        ->and($lonely['key']->fresh()->hasOwner())->toBeFalse();
});

it('ownerless keys keep legacy REST behaviour', function (): void {
    $posts = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);
    expect($auth['key']->owner_id)->toBeNull();

    $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/posts/items/{$item->id}")
        ->assertOk();
    $this->withToken($auth['plain'])
        ->postJson('/api/v1/collections/posts/items', ['data' => []])
        ->assertCreated();
});

it('owned key cannot exceed owner collection ACL on REST and GraphQL', function (): void {
    $posts = makePostsCollection();
    $pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    $postItem = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $pageItem = CollectionItem::factory()->create(['collection_id' => $pages->id]);

    $owner = makeAclOwner($posts, [CollectionPermissionActionEnum::Read]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $pages, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['owner_id' => $owner['user']->id])->save();

    $asKey = fn () => $this->withToken($auth['plain']);

    $asKey()->getJson("/api/v1/collections/posts/items/{$postItem->id}")->assertOk();
    $asKey()->getJson("/api/v1/collections/pages/items/{$pageItem->id}")->assertForbidden();
    $asKey()->getJson('/api/v1/collections')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'posts'])
        ->assertJsonMissing(['slug' => 'pages']);

    $gqlOk = $asKey()->postJson('/api/graphql', [
        'query' => 'query { item(collection: "posts", id: "'.$postItem->id.'") { id } }',
    ]);
    $gqlOk->assertOk();
    expect($gqlOk->json('data.item.id'))->not->toBeNull();

    $gqlDenied = $asKey()->postJson('/api/graphql', [
        'query' => 'query { item(collection: "pages", id: "'.$pageItem->id.'") { id } }',
    ]);
    expect(in_array($gqlDenied->status(), [200, 403], true))->toBeTrue();
    if ($gqlDenied->status() === 200) {
        expect($gqlDenied->json('errors'))->not->toBeEmpty();
    }
});

it('owner role downgrade narrows key access on the next request', function (): void {
    $posts = makePostsCollection();
    $pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages-down',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
    $pageItem = CollectionItem::factory()->create(['collection_id' => $pages->id]);

    $wideOwnerRole = Role::query()->create([
        'name' => 'owner-wide-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    grantRoleActions($wideOwnerRole, $posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($wideOwnerRole, $pages, [CollectionPermissionActionEnum::Read]);

    $narrowOwnerRole = Role::query()->create([
        'name' => 'owner-narrow-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    grantRoleActions($narrowOwnerRole, $posts, [CollectionPermissionActionEnum::Read]);

    $owner = User::factory()->create(['is_active' => true]);
    $owner->syncRoles([$wideOwnerRole]);

    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $pages, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['owner_id' => $owner->id])->save();

    $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/{$pages->slug}/items/{$pageItem->id}")
        ->assertOk();

    $owner->syncRoles([$narrowOwnerRole]);
    app(EffectivePermissionResolver::class)->forget($owner);
    app(CollectionPermissionGuard::class)->forget($wideOwnerRole->id);
    app(CollectionPermissionGuard::class)->forget($narrowOwnerRole->id);

    $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/{$pages->slug}/items/{$pageItem->id}")
        ->assertForbidden();
});

it('revokes owned keys when owner is deactivated, soft-deleted, or force-deleted', function (): void {
    $role = Role::query()->create([
        'name' => 'revoke-role-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $deactivated = User::factory()->create(['is_active' => true]);
    $soft = User::factory()->create(['is_active' => true]);
    $force = User::factory()->create(['is_active' => true]);

    $keyDeactivated = makeApiKeyForRole($role)['key'];
    $keySoft = makeApiKeyForRole($role)['key'];
    $keyForce = makeApiKeyForRole($role)['key'];

    $keyDeactivated->forceFill(['owner_id' => $deactivated->id])->save();
    $keySoft->forceFill(['owner_id' => $soft->id])->save();
    $keyForce->forceFill(['owner_id' => $force->id])->save();

    Activity::query()->delete();

    $deactivated->update(['is_active' => false]);
    expect($keyDeactivated->fresh()->revoked_at)->not->toBeNull();
    expect(
        Activity::query()
            ->where('event', 'api_key_revoked')
            ->where('subject_id', $keyDeactivated->id)
            ->where('properties->reason', 'deactivated')
            ->exists()
    )->toBeTrue();

    $soft->delete();
    expect($keySoft->fresh()->revoked_at)->not->toBeNull();
    expect(
        Activity::query()
            ->where('event', 'api_key_revoked')
            ->where('subject_id', $keySoft->id)
            ->where('properties->reason', 'deleted')
            ->exists()
    )->toBeTrue();

    $force->forceDelete();
    expect($keyForce->fresh()->revoked_at)->not->toBeNull();
    expect(
        Activity::query()
            ->where('event', 'api_key_revoked')
            ->where('subject_id', $keyForce->id)
            ->where('properties->reason', 'deleted')
            ->exists()
    )->toBeTrue();
});

it('rejects requests when owned key owner is inactive even if not yet revoked', function (): void {
    $posts = makePostsCollection();
    $item = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    $owner = User::factory()->create(['is_active' => true]);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $posts, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['owner_id' => $owner->id])->save();

    // Bypass lifecycle hook path: set inactive without firing revoke (direct DB).
    User::query()->whereKey($owner->id)->update(['is_active' => false]);

    $this->withToken($auth['plain'])
        ->getJson("/api/v1/collections/posts/items/{$item->id}")
        ->assertUnauthorized();
});

it('partitions response cache factors by owner_id', function (): void {
    $ownerA = User::factory()->create();
    $ownerB = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'cache-role-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $secretA = ApiKey::generateSecret();
    $keyA = ApiKey::query()->create([
        'name' => 'A',
        'key_prefix' => $secretA['prefix'],
        'key_hash' => $secretA['hash'],
        'role_id' => $role->id,
        'owner_id' => $ownerA->id,
    ]);

    $secretB = ApiKey::generateSecret();
    $keyB = ApiKey::query()->create([
        'name' => 'B',
        'key_prefix' => $secretB['prefix'],
        'key_hash' => $secretB['hash'],
        'role_id' => $role->id,
        'owner_id' => $ownerB->id,
    ]);

    $secretLegacy = ApiKey::generateSecret();
    $keyLegacy = ApiKey::query()->create([
        'name' => 'Legacy',
        'key_prefix' => $secretLegacy['prefix'],
        'key_hash' => $secretLegacy['hash'],
        'role_id' => $role->id,
        'owner_id' => null,
    ]);

    $factorsA = (new ApiAccess('api_key', $role, $keyA))->responseCacheScopeFactors();
    $factorsB = (new ApiAccess('api_key', $role, $keyB))->responseCacheScopeFactors();
    $factorsLegacy = (new ApiAccess('api_key', $role, $keyLegacy))->responseCacheScopeFactors();

    expect($factorsA['api_key_scopes']['owner_id'])->toBe($ownerA->id)
        ->and($factorsB['api_key_scopes']['owner_id'])->toBe($ownerB->id)
        ->and($factorsLegacy['api_key_scopes']['owner_id'])->toBeNull()
        ->and($factorsA)->not->toBe($factorsB);
});
