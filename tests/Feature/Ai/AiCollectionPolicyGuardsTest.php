<?php

declare(strict_types=1);

use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The AI / MCP collection guards answer through CollectionPolicy with their historical
 * `Error: …` strings, for the request actor, a queued run's guard user and an API key actor.
 */
beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    $this->pages = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages',
        'is_singleton' => false,
        'sort_order' => 2,
    ]);

    $this->guards = new class
    {
        use EnforcesAiCollectionPermissionsTrait {
            guardAiCollectionAction as public;
        }
    };
});

function aiPolicyGuardReader(Collection $collection): User
{
    $role = Role::factory()->create(['name' => 'ai-policy-guard-'.uniqid()]);
    $role->givePermissionTo(PermissionEnum::CanShowCollections->value, PermissionEnum::CanEditCollections->value);
    grantRoleActions($role, $collection, [CollectionPermissionActionEnum::Read]);

    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    return $user;
}

it('keeps the not-found read denial and the unauthorized write denial', function (): void {
    $this->actingAs(aiPolicyGuardReader($this->posts));

    expect($this->guards->guardAiCollectionAction($this->posts, CollectionPermissionActionEnum::Read))->toBeNull()
        ->and($this->guards->guardAiCollectionAction($this->pages, CollectionPermissionActionEnum::Read))
        ->toBe('Error: Collection not found.')
        ->and($this->guards->guardAiCollectionAction($this->posts, CollectionPermissionActionEnum::Update))
        ->toBe('Error: This action is unauthorized for the collection.');
});

it('judges the guard user when a queued run has no request user', function (): void {
    request()->setUserResolver(static fn (): ?User => null);
    auth()->setUser(aiPolicyGuardReader($this->posts));

    expect($this->guards->guardAiCollectionAction($this->posts, CollectionPermissionActionEnum::Read))->toBeNull()
        ->and($this->guards->guardAiCollectionAction($this->pages, CollectionPermissionActionEnum::Read))
        ->toBe('Error: Collection not found.');
});

it('applies the API key scopes even when the key owner is a super-admin', function (): void {
    $owner = User::factory()->create(['is_active' => true]);
    $owner->assignRole(RoleEnum::SuperAdmin->value);
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $this->posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Update,
    ]);
    $auth['key']->forceFill(['owner_id' => $owner->id, 'read_only' => true])->save();
    $this->actingAs($owner);
    request()->attributes->set('apiAccess', new ApiAccess('api_key', $auth['role'], $auth['key']->fresh()));

    expect($this->guards->guardAiCollectionAction($this->posts, CollectionPermissionActionEnum::Read))->toBeNull()
        ->and($this->guards->guardAiCollectionAction($this->posts, CollectionPermissionActionEnum::Update))
        ->toBe('Error: This action is unauthorized for the collection.')
        ->and($this->guards->guardAiCollectionAction($this->pages, CollectionPermissionActionEnum::Read))
        ->toBe('Error: Collection not found.');
});
