<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Pins the denial bodies of the web and REST item callers that go through CollectionPolicy and
 * CollectionItemPolicy: 403s keep the enforcer's messages, unreadable items stay an empty 404.
 */
beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    CollectionField::factory()->create([
        'collection_id' => $this->posts->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);
    $this->published = collectionItemDenialItem($this->posts, 'published');
    $this->draft = collectionItemDenialItem($this->posts, 'draft');
});

function collectionItemDenialItem(Collection $collection, string $status): CollectionItem
{
    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriterService::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizerService::class)->normalize($collection, ['status' => $status], true),
    );

    return $item;
}

/**
 * Read and Update on the collection, both limited to published items.
 */
function grantPublishedOnly(Role $role, Collection $collection): void
{
    foreach ([CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Update] as $action) {
        CollectionPermission::query()->create([
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => $action->value,
            'allowed' => true,
            'rules' => [
                'fields' => [],
                'item_filter' => [
                    'logic' => 'and',
                    'rules' => [['field' => 'status', 'operator' => 'equals', 'value' => 'published']],
                ],
            ],
        ]);
    }

    app(CollectionPermissionGuardService::class)->forget($role->id);
}

it('keeps the web item denial bodies', function (): void {
    $role = Role::factory()->create(['name' => 'denial-web-'.uniqid()]);
    $role->givePermissionTo(
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    );
    grantPublishedOnly($role, $this->posts);
    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    $this->actingAs($user)
        ->getJson(route('collections.items.show', [$this->posts, $this->draft]))
        ->assertNotFound()
        ->assertJsonPath('message', '');

    $this->actingAs($user)
        ->putJson(route('collections.items.update', [$this->posts, $this->draft]), ['data' => ['status' => 'draft']])
        ->assertForbidden()
        ->assertJsonPath('message', 'This item is outside your permission filter.');

    $this->actingAs($user)
        ->deleteJson(route('collections.items.destroy', [$this->posts, $this->published]))
        ->assertForbidden()
        ->assertJsonPath('message', 'This action is unauthorized for the collection.');
});

it('keeps the REST item denial bodies', function (): void {
    $bundle = makeApiKeyForRole();
    grantPublishedOnly($bundle['role'], $this->posts);
    $client = $this->withToken($bundle['plain']);

    $client->getJson("/api/v1/collections/posts/items/{$this->draft->id}")
        ->assertNotFound()
        ->assertJsonPath('message', '');

    $client->patchJson("/api/v1/collections/posts/items/{$this->draft->id}", ['data' => ['status' => 'draft']])
        ->assertForbidden()
        ->assertJsonPath('message', 'This item is outside your permission filter.');

    $client->deleteJson("/api/v1/collections/posts/items/{$this->published->id}")
        ->assertForbidden()
        ->assertJsonPath('message', 'This action is unauthorized for the collection.');
});
