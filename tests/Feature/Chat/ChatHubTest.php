<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Events\ChatThreadUpserted;
use App\Events\ChatUnreadUpdated;
use App\Models\Chat;
use App\Models\ChatParticipant;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{user: User, other: User, collection: Collection, item: CollectionItem}
 */
function hubKitchen(array $extra = []): array
{
    $permissions = array_values(array_unique([
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
        ...$extra,
    ]));
    $user = grantCollectionPermissions(User::factory()->create(), $permissions);
    $other = grantCollectionPermissions(User::factory()->create([
        'first_name' => 'Reader',
        'last_name' => 'Test',
    ]), [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
    ]);
    $collection = Collection::factory()->create(['name' => 'Kitchen Sink']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'other', 'collection', 'item');
}

test('hub is forbidden without can-show-chat', function () {
    $user = grantCollectionPermissions(User::factory()->create(), allCollectionPermissions());
    $this->actingAs($user)
        ->get(route('chat.index'))
        ->assertForbidden();
});

test('create direct chat is forbidden without can-create-direct-chats', function () {
    ['user' => $user, 'other' => $other] = hubKitchen();
    $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->assertForbidden();
});

test('create direct chat works with can-create-direct-chats', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $payload = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->assertCreated()
        ->json('chat');

    expect($payload['kind'])->toBe('direct');

    $this->actingAs($other)
        ->getJson(route('chat.threads.index', ['tab' => 'private']))
        ->assertOk()
        ->assertJsonPath('data.0.id', $payload['id']);

    $this->actingAs($other)
        ->getJson(route('chat.threads.index', ['tab' => 'collection']))
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

test('create direct chat broadcasts ThreadUpserted to peer private channel', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    Event::fake([ChatThreadUpserted::class]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->assertCreated()
        ->json('chat.id');

    Event::assertDispatched(ChatThreadUpserted::class, function (ChatThreadUpserted $event) use ($other, $chatId): bool {
        return $event->userId === (int) $other->id
            && $event->broadcastAs() === 'ThreadUpserted'
            && $event->broadcastOn()[0]->name === 'private-App.Models.User.'.$other->id
            && ($event->chat['id'] ?? null) === $chatId
            && ($event->chat['kind'] ?? null) === 'direct';
    });
    Event::assertNotDispatched(ChatThreadUpserted::class, function (ChatThreadUpserted $event) use ($user): bool {
        return $event->userId === (int) $user->id;
    });

    // Existing DM (findOrCreate) must not re-broadcast create.
    Event::fake([ChatThreadUpserted::class]);

    $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->assertCreated();

    Event::assertNotDispatched(ChatThreadUpserted::class);
});

test('direct message broadcasts ThreadUpserted with last_message for peer list', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->assertCreated()
        ->json('chat.id');

    Event::fake([ChatThreadUpserted::class]);

    $this->actingAs($user)
        ->postJson(route('chat.messages.store', $chatId), [
            'body' => 'asdfasdf',
        ])
        ->assertCreated();

    Event::assertDispatched(ChatThreadUpserted::class, function (ChatThreadUpserted $event) use ($other, $chatId): bool {
        return $event->userId === (int) $other->id
            && ($event->chat['id'] ?? null) === $chatId
            && ($event->chat['last_message']['body'] ?? null) === 'asdfasdf'
            && ($event->chat['unread_count'] ?? null) === 1
            && $event->broadcastOn()[0]->name === 'private-App.Models.User.'.$other->id;
    });
});

test('group member sync expands and removes via_group participants', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $late = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowChat->value,
    ]);
    $group = UserGroup::factory()->create(['name' => 'Ops']);
    $group->users()->sync([$other->id]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$user->id],
            'group_ids' => [$group->id],
        ])
        ->assertCreated()
        ->json('chat.id');

    expect(ChatParticipant::query()->where('chat_id', $chatId)->where('user_id', $late->id)->exists())->toBeFalse();

    $group->users()->sync([$other->id, $late->id]);

    $lateRow = ChatParticipant::query()
        ->where('chat_id', $chatId)
        ->where('user_id', $late->id)
        ->first();
    expect($lateRow)->not->toBeNull()
        ->and($lateRow->source)->toBe(ChatParticipant::SOURCE_VIA_GROUP);

    $group->users()->sync([$other->id]);

    expect(ChatParticipant::query()->where('chat_id', $chatId)->where('user_id', $late->id)->exists())->toBeFalse();
});

test('direct one-to-one rejects mentions entirely', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $outsider = User::factory()->create();
    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'hi @[user:'.$outsider->id.']',
        'mentioned_user_ids' => [$outsider->id],
    ])->assertUnprocessable();

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'hi @[user:'.$other->id.']',
        'mentioned_user_ids' => [$other->id],
    ])->assertUnprocessable();

    $this->getJson(route('chat.mentions', $chatId).'?q=a')
        ->assertOk()
        ->assertJsonPath('users', []);
});

test('direct group chat allows mentioning a participant', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $third = User::factory()->create(['is_active' => true]);
    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id, $third->id],
        ])
        ->json('chat.id');

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'hi @[user:'.$other->id.']',
        'mentioned_user_ids' => [$other->id],
    ])->assertCreated();

    $outsider = User::factory()->create();
    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'hi @[user:'.$outsider->id.']',
        'mentioned_user_ids' => [$outsider->id],
    ])->assertUnprocessable();
});

test('item chat uuid is 404 when the item is not readable', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = hubKitchen();
    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'secret',
        ])
        ->assertCreated();

    $chatId = Chat::query()->where('collection_item_id', $item->id)->value('id');
    $stranger = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowChat->value,
    ]);

    $this->actingAs($stranger)
        ->get(route('chat.show', $chatId))
        ->assertNotFound();
});

test('collection tab lists readable item threads the viewer did not start', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'shared kitchen',
        ])
        ->assertCreated();

    $chatId = Chat::query()->where('collection_item_id', $item->id)->value('id');

    $list = $this->actingAs($other)
        ->getJson(route('chat.threads.index', ['tab' => 'collection']))
        ->assertOk()
        ->json('data');

    expect(collect($list)->pluck('id')->all())->toContain($chatId);

    $filtered = $this->actingAs($other)
        ->getJson(route('chat.threads.index', ['tab' => 'collection', 'q' => 'shared kitchen']))
        ->assertOk()
        ->json('data');

    expect(collect($filtered)->pluck('id')->all())->toContain($chatId);
});

test('hub page renders for users with can-show-chat', function () {
    ['user' => $user] = hubKitchen();

    $this->actingAs($user)
        ->get(route('chat.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('chat/index')
            ->where('canCreateDirect', false));
});

test('directory options require can-create-direct-chats', function () {
    ['user' => $user] = hubKitchen();

    $this->actingAs($user)
        ->getJson(route('chat.options.directory'))
        ->assertForbidden();
});

test('item picker requires can-show-chat', function () {
    $user = grantCollectionPermissions(User::factory()->create(), allCollectionPermissions());

    $this->actingAs($user)
        ->getJson(route('chat.options.item-picker'))
        ->assertForbidden();
});

test('directory options list users and groups', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $group = UserGroup::factory()->create(['name' => 'Ops']);

    $payload = $this->actingAs($user)
        ->getJson(route('chat.options.directory'))
        ->assertOk()
        ->json('data');

    expect(collect($payload)->where('type', 'user')->pluck('id')->all())
        ->toContain($other->id)
        ->not->toContain($user->id);
    expect(collect($payload)->where('type', 'group')->pluck('id')->all())
        ->toContain($group->id);
});

test('item picker groups readable items by collection', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = hubKitchen();
    $other = Collection::factory()->create(['name' => 'Other Bowl']);
    CollectionField::factory()->create([
        'collection_id' => $other->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $otherItem = $other->items()->create([]);

    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, [
            'title' => 'Sink Widget',
        ], true),
    );

    $payload = $this->actingAs($user)
        ->getJson(route('chat.options.item-picker'))
        ->assertOk()
        ->json('data');

    $names = collect($payload)->pluck('name')->all();
    expect($names)->toContain('Kitchen Sink')
        ->toContain('Other Bowl');

    $kitchen = collect($payload)->firstWhere('name', 'Kitchen Sink');
    expect(collect($kitchen['items'])->pluck('id')->all())->toContain($item->id);
    expect(collect($kitchen['items'])->pluck('label')->all())->toContain('Sink Widget');

    $bowl = collect($payload)->firstWhere('name', 'Other Bowl');
    expect(collect($bowl['items'])->pluck('id')->all())->toContain($otherItem->id);

    $filtered = $this->actingAs($user)
        ->getJson(route('chat.options.item-picker', ['q' => 'Kitchen']))
        ->assertOk()
        ->json('data');

    expect(collect($filtered)->pluck('name')->all())->toContain('Kitchen Sink')
        ->not->toContain('Other Bowl');

    $byItem = $this->actingAs($user)
        ->getJson(route('chat.options.item-picker', ['q' => 'Sink Widget']))
        ->assertOk()
        ->json('data');

    expect(collect($byItem)->pluck('name')->all())->toContain('Kitchen Sink')
        ->not->toContain('Other Bowl');
});

test('private message increments the other user unread', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'hello private',
    ])->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 1)
        ->assertJsonPath('unread_private', 1)
        ->assertJsonPath('unread_collection', 0);

    $row = $this->getJson(route('chat.threads.index', ['tab' => 'private']))
        ->assertOk()
        ->json('data.0');

    expect($row['id'])->toBe($chatId)
        ->and($row['unread_count'])->toBe(1);

    $this->actingAs($user)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 0);
});

test('collection message does not increment a stranger who never posted was not mentioned and has no notify', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'noise',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 0)
        ->assertJsonPath('unread_collection', 0);

    $row = collect($this->getJson(route('chat.threads.index', ['tab' => 'collection']))->json('data'))
        ->firstWhere('collection_item_id', $item->id);

    expect($row)->not->toBeNull()
        ->and($row['unread_count'])->toBe(0);
});

test('collection mention increments unread', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'hey @[user:'.$other->id.']',
            'mentioned_user_ids' => [$other->id],
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 1)
        ->assertJsonPath('unread_collection', 1);
});

test('collection notify broadcasts unread totals to subscriber', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($other)
        ->putJson(route('collections.items.chat.notify', [$collection, $item]), [
            'notify' => true,
        ])
        ->assertOk();

    Event::fake([ChatUnreadUpdated::class]);

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'broadcast',
        ])
        ->assertCreated();

    Event::assertDispatched(ChatUnreadUpdated::class, function (ChatUnreadUpdated $event) use ($other, $item): bool {
        $itemChat = Chat::query()
            ->where('kind', Chat::KIND_ITEM)
            ->where('collection_item_id', $item->id)
            ->first();

        return $event->userId === (int) $other->id
            && $event->collection >= 1
            && $itemChat !== null
            && $event->chatId === $itemChat->id
            && $event->chatUnreadCount >= 1
            && $event->broadcastAs() === 'ChatUnreadUpdated'
            && $event->broadcastOn()[0]->name === 'private-App.Models.User.'.$other->id
            && $event->broadcastWith()['chat_id'] === $itemChat->id
            && $event->broadcastWith()['chat_unread_count'] >= 1
            && $event->broadcastWith()['play_sound'] === true
            && $event->playSound === true;
    });
});

test('collection notify increments unread', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($other)
        ->putJson(route('collections.items.chat.notify', [$collection, $item]), [
            'notify' => true,
        ])
        ->assertOk();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'broadcast',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_collection', 1);
});

test('collection poster gets unread on later messages', function () {
    ['user' => $user, 'other' => $other, 'collection' => $collection, 'item' => $item] = hubKitchen();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'first',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'i am in',
        ])
        ->assertCreated();

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'second',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_collection', 1);
});

test('opening a chat marks it read and drops sidebar total', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'ping',
    ])->assertCreated();

    Event::fake([ChatUnreadUpdated::class]);

    $this->actingAs($other)
        ->get(route('chat.show', $chatId))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('chat.unread_count', 0)
            ->where('chat.unread_private', 0));

    Event::assertDispatched(ChatUnreadUpdated::class, function (ChatUnreadUpdated $event) use ($other, $chatId): bool {
        return $event->userId === (int) $other->id
            && $event->chatId === $chatId
            && $event->chatUnreadCount === 0
            && $event->total === 0;
    });

    $this->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 0);
});

test('open chat does not increment while viewer is on the thread', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->actingAs($other)
        ->postJson(route('chat.read', $chatId))
        ->assertOk();

    Event::fake([ChatUnreadUpdated::class]);

    $this->actingAs($user)
        ->postJson(route('chat.messages.store', $chatId), [
            'body' => 'while you look',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 0);

    Event::assertDispatched(ChatUnreadUpdated::class, function (ChatUnreadUpdated $event) use ($other, $chatId): bool {
        return $event->userId === (int) $other->id
            && $event->chatId === $chatId
            && $event->total === 0
            && $event->playSound === true
            && $event->broadcastWith()['play_sound'] === true;
    });
});

test('stop viewing clears viewer so later messages increment unread', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->actingAs($other)
        ->postJson(route('chat.read', $chatId))
        ->assertOk();

    $this->actingAs($other)
        ->postJson(route('chat.stop-viewing', $chatId))
        ->assertOk()
        ->assertJsonPath('ok', true);

    $this->actingAs($user)
        ->postJson(route('chat.messages.store', $chatId), [
            'body' => 'after you left',
        ])
        ->assertCreated();

    $this->actingAs($other)
        ->getJson(route('chat.unread-count'))
        ->assertOk()
        ->assertJsonPath('unread_count', 1);
});

test('inertia shares sidebar chat unread total', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->postJson(route('chat.messages.store', $chatId), [
        'body' => 'sidebar',
    ])->assertCreated();

    $this->actingAs($other)
        ->get(route('chat.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('chat.unread_count', 1)
            ->where('chat.unread_private', 1)
            ->where('chat.unread_collection', 0));
});

test('add participants to direct chat', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $third = grantCollectionPermissions(User::factory()->create([
        'first_name' => 'Third',
        'last_name' => 'Person',
    ]), [
        PermissionEnum::CanShowChat->value,
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->actingAs($user)
        ->postJson(route('chat.participants.store', $chatId), [
            'user_ids' => [$third->id],
        ])
        ->assertOk()
        ->assertJsonPath('chat.participants.2.id', $third->id);

    expect(ChatParticipant::query()
        ->where('chat_id', $chatId)
        ->where('user_id', $third->id)
        ->exists())->toBeTrue();

    $this->actingAs($third)
        ->getJson(route('chat.threads.index', ['tab' => 'private']))
        ->assertOk()
        ->assertJsonPath('data.0.id', $chatId);
});

test('leave direct chat removes participant and hides thread', function () {
    ['user' => $user, 'other' => $other] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $chatId = $this->actingAs($user)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$other->id],
        ])
        ->json('chat.id');

    $this->actingAs($other)
        ->deleteJson(route('chat.destroy', $chatId))
        ->assertOk();

    expect(ChatParticipant::query()
        ->where('chat_id', $chatId)
        ->where('user_id', $other->id)
        ->exists())->toBeFalse();

    $this->actingAs($other)
        ->getJson(route('chat.threads.index', ['tab' => 'private']))
        ->assertOk()
        ->assertJsonCount(0, 'data');

    $this->actingAs($user)
        ->getJson(route('chat.threads.index', ['tab' => 'private']))
        ->assertOk()
        ->assertJsonPath('data.0.id', $chatId);
});

test('cannot add participants to item chat', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = hubKitchen([
        PermissionEnum::CanCreateDirectChats->value,
    ]);

    $this->actingAs($user)
        ->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => 'hi',
        ])
        ->assertCreated();

    $chatId = Chat::query()->where('collection_item_id', $item->id)->value('id');

    $this->postJson(route('chat.participants.store', $chatId), [
        'user_ids' => [999],
    ])->assertStatus(422);
});
