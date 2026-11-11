<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Restoring a revision needs the collection Update grant; restoring a trashed item needs the
 * item inside the actor's write filter (#710).
 */
beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    CollectionField::factory()->create([
        'collection_id' => $this->posts->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);
});

function restoreAuthItem(Collection $collection, string $status): CollectionItem
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
 * Editor whose role holds the given collection grants, each limited by the optional item filter.
 *
 * @param  list<CollectionPermissionActionEnum>  $actions
 * @param  array<string, mixed>|null  $itemFilter
 */
function restoreAuthEditor(Collection $collection, array $actions, ?array $itemFilter = null): User
{
    $role = Role::factory()->create(['name' => 'restore-auth-'.uniqid()]);
    $role->givePermissionTo(
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanRestoreCollections->value,
    );

    foreach ($actions as $action) {
        CollectionPermission::query()->create([
            'role_id' => $role->id,
            'collection_id' => $collection->id,
            'action' => $action->value,
            'allowed' => true,
            'rules' => ['fields' => [], 'item_filter' => $itemFilter],
        ]);
    }
    app(CollectionPermissionGuardService::class)->forget($role->id);

    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    return $user;
}

/**
 * @return array<string, mixed>
 */
function restoreAuthPublishedOnly(): array
{
    return [
        'logic' => 'and',
        'rules' => [['field' => 'status', 'operator' => 'equals', 'value' => 'published']],
    ];
}

it('refuses a revision restore without the collection update grant', function (): void {
    $item = restoreAuthItem($this->posts, 'v1');
    app(CollectionItemValuesWriterService::class)->sync(
        $item->fresh(),
        $this->posts,
        app(CollectionItemDataNormalizerService::class)->normalize($this->posts, ['status' => 'v2'], false),
    );
    $first = CollectionItemRevision::query()->where('item_id', $item->id)->orderBy('id')->firstOrFail();

    $reader = restoreAuthEditor($this->posts, [CollectionPermissionActionEnum::Read]);

    $this->actingAs($reader)
        ->postJson(route('collections.items.revisions.restore', [$this->posts, $item, $first]))
        ->assertForbidden()
        ->assertJsonPath('message', 'This action is unauthorized for the collection.');

    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh())['status'])->toBe('v2');

    $editor = restoreAuthEditor($this->posts, [CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Update]);

    $this->actingAs($editor)
        ->post(route('collections.items.revisions.restore', [$this->posts, $item, $first]))
        ->assertRedirect();
});

it('refuses restoring a trashed item outside the write filter', function (): void {
    $draft = restoreAuthItem($this->posts, 'draft');
    $published = restoreAuthItem($this->posts, 'published');
    $draft->delete();
    $published->delete();

    $editor = restoreAuthEditor(
        $this->posts,
        [CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Update],
        restoreAuthPublishedOnly(),
    );

    $this->actingAs($editor)
        ->postJson(route('collections.items.restore', [$this->posts, $draft]))
        ->assertForbidden()
        ->assertJsonPath('message', 'This item is outside your permission filter.');

    $this->actingAs($editor)
        ->post(route('collections.items.restore', [$this->posts, $published]))
        ->assertRedirect();

    expect($draft->fresh()->trashed())->toBeTrue()
        ->and($published->fresh()->trashed())->toBeFalse();
});

it('refuses a bulk restore when one item is outside the write filter', function (): void {
    $draft = restoreAuthItem($this->posts, 'draft');
    $published = restoreAuthItem($this->posts, 'published');
    $draft->delete();
    $published->delete();

    $editor = restoreAuthEditor(
        $this->posts,
        [CollectionPermissionActionEnum::Read, CollectionPermissionActionEnum::Update],
        restoreAuthPublishedOnly(),
    );

    $this->actingAs($editor)
        ->postJson(route('collections.items.bulk', $this->posts), [
            'action' => 'restore',
            'ids' => [$draft->id, $published->id],
        ])
        ->assertForbidden()
        ->assertJsonPath('message', 'This item is outside your permission filter.');

    expect($draft->fresh()->trashed())->toBeTrue()
        ->and($published->fresh()->trashed())->toBeTrue();
});
