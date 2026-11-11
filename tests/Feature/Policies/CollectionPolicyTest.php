<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    $this->pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);
});

/**
 * Admin user whose only role grants the given actions on one collection.
 *
 * @param  list<CollectionPermissionActionEnum>  $actions
 */
function collectionPolicyAclUser(Collection $collection, array $actions): User
{
    $role = Role::factory()->create(['name' => 'collection-policy-'.uniqid()]);
    $role->givePermissionTo(PermissionEnum::CanShowCollections->value, PermissionEnum::CanEditCollections->value);
    grantRoleActions($role, $collection, $actions);

    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    return $user;
}

it('grants the item actions the role holds on the collection', function (): void {
    $user = collectionPolicyAclUser($this->posts, [CollectionPermissionActionEnum::Read]);
    $gate = Gate::forUser($user);

    expect($gate->allows('viewItems', $this->posts))->toBeTrue()
        ->and($gate->allows('createItems', $this->posts))->toBeFalse()
        ->and($gate->allows('updateItems', $this->posts))->toBeFalse()
        ->and($gate->allows('deleteItems', $this->posts))->toBeFalse();
});

it('denies a collection without a grant with the enforcer message', function (): void {
    $user = collectionPolicyAclUser($this->posts, [CollectionPermissionActionEnum::Read]);

    $response = Gate::forUser($user)->inspect('viewItems', $this->pages);

    expect($response->denied())->toBeTrue()
        ->and($response->message())->toBe('This action is unauthorized for the collection.')
        ->and($response->status())->toBeNull();
});

it('keeps Spatie-only users on their collection permissions', function (): void {
    $reader = User::factory()->create(['is_active' => true]);
    $reader->givePermissionTo(PermissionEnum::CanShowCollections->value);

    expect(Gate::forUser($reader)->allows('viewItems', $this->pages))->toBeTrue()
        ->and(Gate::forUser($reader)->allows('updateItems', $this->pages))->toBeFalse();
});

it('grants super-admins every item action', function (): void {
    $superAdmin = User::factory()->create(['is_active' => true]);
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    foreach (CollectionPermissionActionEnum::cases() as $action) {
        expect(Gate::forUser($superAdmin)->allows($action->itemsAbility(), $this->pages))->toBeTrue();
    }
});

it('narrows an API key role by its collection and read-only scopes', function (): void {
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $this->posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Update,
    ]);
    grantRoleActions($auth['role'], $this->pages, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['collection_slugs' => ['posts'], 'read_only' => true])->save();
    request()->attributes->set('apiAccess', new ApiAccess('api_key', $auth['role'], $auth['key']));

    $gate = Gate::forUser(null);

    expect($gate->allows('viewItems', $this->posts))->toBeTrue()
        ->and($gate->allows('updateItems', $this->posts))->toBeFalse()
        ->and($gate->allows('viewItems', $this->pages))->toBeFalse()
        ->and($gate->allows('createItems', $this->posts))->toBeFalse();
});

it('caps an owned API key at its owner access', function (): void {
    $owner = collectionPolicyAclUser($this->posts, [CollectionPermissionActionEnum::Read]);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $this->posts, [CollectionPermissionActionEnum::Read]);
    grantRoleActions($auth['role'], $this->pages, [CollectionPermissionActionEnum::Read]);
    $auth['key']->forceFill(['owner_id' => $owner->id])->save();
    request()->attributes->set('apiAccess', new ApiAccess('api_key', $auth['role'], $auth['key']->fresh()));

    expect(Gate::forUser(null)->allows('viewItems', $this->posts))->toBeTrue()
        ->and(Gate::forUser(null)->allows('viewItems', $this->pages))->toBeFalse();
});

it('denies a guest without an API actor', function (): void {
    expect(Gate::forUser(null)->allows('viewItems', $this->posts))->toBeFalse();
});

it('judges another gate user on their own grants during an API request', function (): void {
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $this->posts, [CollectionPermissionActionEnum::Read]);
    request()->attributes->set('apiAccess', new ApiAccess('api_key', $auth['role'], $auth['key']));
    $pagesReader = collectionPolicyAclUser($this->pages, [CollectionPermissionActionEnum::Read]);

    expect(Gate::forUser($pagesReader)->allows('viewItems', $this->pages))->toBeTrue()
        ->and(Gate::forUser($pagesReader)->allows('viewItems', $this->posts))->toBeFalse();
});
