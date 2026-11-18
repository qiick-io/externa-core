<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

/**
 * Chat follows the collection ACL: a user with a Read grant on one collection only is
 * ACL-scoped, so every other collection is closed to them in chat (#703).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function chatScopeCollection(string $name): Collection
{
    $collection = Collection::factory()->create(['name' => $name]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    return $collection;
}

/**
 * @return array{author: User, scoped: User, granted: Collection, grantedItem: CollectionItem, closed: Collection, closedItem: CollectionItem, closedChatId: string}
 */
function chatScopeKitchen(): array
{
    $granted = chatScopeCollection('Granted Shelf');
    $closed = chatScopeCollection('Closed Vault');
    $grantedItem = $granted->items()->create([]);
    $closedItem = $closed->items()->create([]);

    // No collection_permissions grant at all: unrestricted through can-show-collections.
    $author = grantCollectionPermissions(User::factory()->create(), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
    ]);

    $scopedRole = Role::query()->create(['name' => 'granted-shelf-reader', 'guard_name' => 'web']);
    $scopedRole->syncPermissions([
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
    ]);
    grantRoleActions($scopedRole, $granted, [CollectionPermissionActionEnum::Read]);
    $scoped = User::factory()->create(['first_name' => 'Scoped', 'last_name' => 'Reader']);
    $scoped->assignRole($scopedRole);

    test()->actingAs($author)
        ->postJson(route('collections.items.chat.store', [$closed, $closedItem]), ['body' => 'vault notes'])
        ->assertCreated();
    $closedChatId = (string) Chat::query()->where('collection_item_id', $closedItem->id)->value('id');

    return compact('author', 'scoped', 'granted', 'grantedItem', 'closed', 'closedItem', 'closedChatId');
}

test('the hub list hides item chats of collections without a grant', function () {
    ['scoped' => $scoped, 'closedChatId' => $closedChatId] = chatScopeKitchen();

    $threadIds = collect($this->actingAs($scoped)
        ->getJson(route('chat.threads.index', ['tab' => 'collection']))
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($threadIds)->not->toContain($closedChatId);
});

test('the pickers offer only collections the user has a grant for', function () {
    ['scoped' => $scoped, 'closed' => $closed] = chatScopeKitchen();

    $pickerNames = collect($this->actingAs($scoped)
        ->getJson(route('chat.options.item-picker'))
        ->assertOk()
        ->json('data'))->pluck('name')->all();

    expect($pickerNames)->toContain('Granted Shelf')->not->toContain('Closed Vault');

    $collectionNames = collect($this->getJson(route('chat.options.collections'))
        ->assertOk()
        ->json('collections'))->pluck('name')->all();

    expect($collectionNames)->toContain('Granted Shelf')->not->toContain('Closed Vault');

    $this->getJson(route('chat.options.items', ['collection_id' => $closed->id]))
        ->assertNotFound();
});

test('mentions leave out users and collections without a grant', function () {
    [
        'author' => $author,
        'scoped' => $scoped,
        'granted' => $granted,
        'grantedItem' => $grantedItem,
        'closedChatId' => $closedChatId,
        'closed' => $closed,
    ] = chatScopeKitchen();

    $mentionableIds = collect($this->actingAs($author)
        ->getJson(route('chat.mentions', $closedChatId).'?q=Scoped')
        ->assertOk()
        ->json('users'))->pluck('id')->all();

    expect($mentionableIds)->not->toContain($scoped->id);

    $this->postJson(route('chat.messages.store', $closedChatId), [
        'body' => 'see @[user:'.$scoped->id.']',
        'mentioned_user_ids' => [$scoped->id],
    ])->assertUnprocessable();

    $this->actingAs($scoped)
        ->postJson(route('collections.items.chat.store', [$granted, $grantedItem]), ['body' => 'shelf notes'])
        ->assertCreated();
    $grantedChatId = (string) Chat::query()->where('collection_item_id', $grantedItem->id)->value('id');

    $collectionNames = collect($this->getJson(route('chat.mentions', $grantedChatId).'?q=')
        ->assertOk()
        ->json('collections'))->pluck('name')->all();

    expect($collectionNames)->toContain('Granted Shelf')->not->toContain('Closed Vault');

    $this->postJson(route('chat.messages.store', $grantedChatId), [
        'body' => 'compare @[collection:'.$closed->id.']',
    ])->assertUnprocessable();
});
