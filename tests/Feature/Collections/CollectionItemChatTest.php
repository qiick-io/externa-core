<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Events\ItemChatMessageCreated;
use App\Events\ItemChatMessageDeleted;
use App\Events\ItemChatMessageUpdated;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionItemChatReaction;
use App\Models\File;
use App\Models\User;
use App\Notifications\ItemChatNotification;
use App\Services\Collections\CollectionItemValuesAssembler;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
    Storage::fake('assets');
});

/**
 * @return array{user: User, collection: Collection, item: CollectionItem}
 */
function chatKitchen(array $extraPermissions = []): array
{
    $permissions = array_values(array_unique([
        ...allCollectionPermissions(),
        ...$extraPermissions,
    ]));
    $user = grantCollectionPermissions(User::factory()->create(), $permissions);
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

test('create list and paginate chat messages newest page chronological', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    foreach (['one', 'two', 'three'] as $body) {
        $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
            'body' => $body,
        ])->assertCreated();
    }

    $page = $this->getJson(
        route('collections.items.chat.index', [$collection, $item]).'?per_page=2',
    )
        ->assertOk()
        ->assertJsonPath('meta.total', 3)
        ->assertJsonPath('meta.has_more', true)
        ->assertJsonCount(2, 'messages')
        ->json();

    expect($page['messages'][0]['body'])->toBe('two')
        ->and($page['messages'][1]['body'])->toBe('three');

    $older = $this->getJson(
        route('collections.items.chat.index', [$collection, $item])
            .'?per_page=2&before_id='.$page['messages'][0]['id'],
    )
        ->assertOk()
        ->assertJsonPath('meta.has_more', false)
        ->assertJsonCount(1, 'messages')
        ->json();

    expect($older['messages'][0]['body'])->toBe('one');
});

test('chat events broadcast immediately without a queue worker', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $created = new ItemChatMessageCreated('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ['id' => 1]);
    $updated = new ItemChatMessageUpdated('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ['id' => 1]);
    $deleted = new ItemChatMessageDeleted('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 1);

    expect($created)->toBeInstanceOf(ShouldBroadcastNow::class)
        ->and($created->broadcastAs())->toBe('MessageCreated')
        ->and($created->broadcastOn()[0]->name)->toBe('presence-chat.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        ->and($updated)->toBeInstanceOf(ShouldBroadcastNow::class)
        ->and($updated->broadcastAs())->toBe('MessageUpdated')
        ->and($deleted)->toBeInstanceOf(ShouldBroadcastNow::class)
        ->and($deleted->broadcastAs())->toBe('MessageDeleted');

    Event::fake([ItemChatMessageCreated::class]);

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'live',
    ])->assertCreated();

    Event::assertDispatched(ItemChatMessageCreated::class, function (ItemChatMessageCreated $event): bool {
        return ($event->message['body'] ?? null) === 'live'
            && str_starts_with($event->broadcastOn()[0]->name, 'presence-chat.');
    });
});

test('item form includes chat_count', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'hello',
    ])->assertCreated();

    $this->get(route('collections.items.show', [$collection, $item]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('chat_count', 1));
});

test('users without collection read cannot list or post chat messages', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = $collection->items()->create([]);

    $this->getJson(route('collections.items.chat.index', [$collection, $item]))
        ->assertForbidden();
    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'nope',
    ])->assertForbidden();
});

test('mention notifies the mentioned user and not the author', function () {
    Notification::fake();

    ['user' => $author, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $mentioned = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($author);

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'Hey @[user:'.$mentioned->id.']',
        'mentioned_user_ids' => [$mentioned->id, $author->id],
    ])->assertCreated();

    Notification::assertSentTo($mentioned, ItemChatNotification::class, function (ItemChatNotification $notification) use ($collection, $item, $mentioned): bool {
        $url = $notification->toArray($mentioned)['url'] ?? '';

        return $notification->mentioned === true
            && $notification->collectionId === (int) $collection->id
            && $notification->itemId === (int) $item->id
            && str_starts_with($url, '/chat/');
    });
    Notification::assertNotSentTo($author, ItemChatNotification::class);
});

test('collection subscribe notifies followers and not the author', function () {
    Notification::fake();

    ['user' => $author, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $follower = grantCollectionPermissions(User::factory()->create());

    $this->actingAs($follower)
        ->putJson(route('collections.items.chat.notify', [$collection, $item]), [
            'notify' => true,
        ])
        ->assertOk()
        ->assertJsonPath('notify', true);

    $this->actingAs($author)
        ->putJson(route('collections.items.chat.notify', [$collection, $item]), [
            'notify' => true,
        ])
        ->assertOk();

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'broadcast',
    ])->assertCreated();

    Notification::assertSentTo($follower, ItemChatNotification::class, function (ItemChatNotification $notification): bool {
        return $notification->mentioned === false;
    });
    Notification::assertNotSentTo($author, ItemChatNotification::class);
});

test('chat attachment stays out of the files pool until save-to-files', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen([
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('note.txt', 'isolated')],
    )
        ->assertCreated()
        ->json('attachment');

    expect(File::query()->count())->toBe(0)
        ->and(CollectionItemChatAttachment::query()->where('id', $upload['id'])->exists())->toBeTrue();

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'with file',
        'attachment_ids' => [$upload['id']],
    ])->assertCreated();

    expect(File::query()->count())->toBe(0);

    $this->actingAs($user)
        ->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('files.total', 0));

    $saved = $this->postJson(route('collections.items.chat.attachments.save-to-files', [
        $collection,
        $item,
        $upload['id'],
    ]))
        ->assertOk()
        ->json();

    expect(File::query()->where('id', $saved['file']['id'])->exists())->toBeTrue()
        ->and($saved['attachment']['transferred_file_id'])->toBe($saved['file']['id']);
});

test('add-to-field writes the transferred file id onto an image field', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen([
        PermissionEnum::CanCreateFiles->value,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'hero',
        'type' => FieldTypeEnum::Image,
    ]);
    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->image('hero.png', 20, 20)],
    )->assertCreated()->json('attachment');

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'hero shot',
        'attachment_ids' => [$upload['id']],
    ])->assertCreated();

    $this->postJson(route('collections.items.chat.attachments.add-to-field', [
        $collection,
        $item,
        $upload['id'],
    ]), ['field' => 'hero'])
        ->assertOk()
        ->assertJsonPath('field', 'hero');

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    $fileId = CollectionItemChatAttachment::query()->where('id', $upload['id'])->value('transferred_file_id');

    expect($fileId)->not->toBeNull()
        ->and($assembled['hero'])->toBe($fileId);
});

test('add-to-field appends onto a files field', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen([
        PermissionEnum::CanCreateFiles->value,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'gallery',
        'type' => FieldTypeEnum::Files,
    ]);
    $this->actingAs($user);

    $first = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('a.pdf', '%PDF-1.4')],
    )->assertCreated()->json('attachment');
    $second = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('b.pdf', '%PDF-1.4')],
    )->assertCreated()->json('attachment');

    $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'docs',
        'attachment_ids' => [$first['id'], $second['id']],
    ])->assertCreated();

    $this->postJson(route('collections.items.chat.attachments.add-to-field', [
        $collection, $item, $first['id'],
    ]), ['field' => 'gallery'])->assertOk();
    $this->postJson(route('collections.items.chat.attachments.add-to-field', [
        $collection, $item, $second['id'],
    ]), ['field' => 'gallery'])->assertOk();

    $assembled = app(CollectionItemValuesAssembler::class)->assemble($item->fresh());
    $ids = CollectionItemChatAttachment::query()
        ->whereIn('id', [$first['id'], $second['id']])
        ->orderBy('created_at')
        ->pluck('transferred_file_id')
        ->all();

    expect($assembled['gallery'])->toEqualCanonicalizing($ids);
});

test('author can delete own message but not another users', function () {
    ['user' => $author, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $other = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($author);

    $ownId = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'mine',
    ])->assertCreated()->json('message.id');

    $this->actingAs($other);
    $otherId = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'theirs',
    ])->assertCreated()->json('message.id');

    $this->deleteJson(route('collections.items.chat.destroy', [$collection, $item, $otherId]))
        ->assertOk();
    expect(CollectionItemChatMessage::query()->find($otherId))->toBeNull();

    $this->deleteJson(route('collections.items.chat.destroy', [$collection, $item, $ownId]))
        ->assertForbidden();
    expect(CollectionItemChatMessage::query()->find($ownId))->not->toBeNull();
});

test('editor cannot delete another users message', function () {
    ['user' => $author, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $editor = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($author);

    $id = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'please remove',
    ])->assertCreated()->json('message.id');

    $listed = $this->actingAs($editor)
        ->getJson(route('collections.items.chat.index', [$collection, $item]))
        ->assertOk()
        ->json('messages');

    $row = collect($listed)->firstWhere('id', $id);
    expect($row['can_delete'])->toBeFalse()
        ->and($row['can_edit'])->toBeFalse();

    $this->actingAs($editor)
        ->deleteJson(route('collections.items.chat.destroy', [$collection, $item, $id]))
        ->assertForbidden();

    expect(CollectionItemChatMessage::query()->find($id))->not->toBeNull();
});

test('super-admin cannot delete another users message', function () {
    $this->seed(RoleSeeder::class);

    ['user' => $author, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($author);

    $id = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'please remove',
    ])->assertCreated()->json('message.id');

    $listed = $this->actingAs($superAdmin)
        ->getJson(route('collections.items.chat.index', [$collection, $item]))
        ->assertOk()
        ->json('messages');

    $row = collect($listed)->firstWhere('id', $id);
    expect($row['can_delete'])->toBeFalse()
        ->and($row['can_edit'])->toBeFalse();

    $this->actingAs($superAdmin)
        ->deleteJson(route('collections.items.chat.destroy', [$collection, $item, $id]))
        ->assertForbidden();

    expect(CollectionItemChatMessage::query()->find($id))->not->toBeNull();
});

test('mentions autocomplete returns active readers', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $reader = grantCollectionPermissions(User::factory()->create([
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
    ]), [PermissionEnum::CanShowCollections->value]);
    User::factory()->create([
        'first_name' => 'Ada',
        'last_name' => 'Hidden',
        'is_active' => false,
    ]);
    $this->actingAs($user);

    $hits = $this->getJson(
        route('collections.items.chat.mentions', [$collection, $item]).'?q=Ada',
    )
        ->assertOk()
        ->json('users');

    $ids = collect($hits)->pluck('id')->all();
    expect($ids)->toContain($reader->id)
        ->and($ids)->not->toContain(
            User::query()->where('last_name', 'Hidden')->value('id'),
        );
});

test('save-to-files is forbidden without can-create-files', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('note.txt', 'x')],
    )->assertCreated()->json('attachment');

    $this->postJson(route('collections.items.chat.attachments.save-to-files', [
        $collection, $item, $upload['id'],
    ]))->assertForbidden();

    expect(File::query()->count())->toBe(0);
});

test('reply_to_id is stored on the same item', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $parentId = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'parent',
    ])->assertCreated()->json('message.id');

    $reply = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'child',
        'reply_to_id' => $parentId,
    ])->assertCreated()->json('message');

    expect($reply['reply_to']['id'])->toBe($parentId)
        ->and($reply['reply_to']['body'])->toBe('parent')
        ->and(CollectionItemChatMessage::query()->find($reply['id'])->reply_to_id)->toBe($parentId);
});

test('pin toggles pinned_at and lists the message in pinned', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $id = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'pin me',
    ])->assertCreated()->json('message.id');

    $pinned = $this->putJson(route('collections.items.chat.pin', [$collection, $item, $id]), [
        'pinned' => true,
    ])->assertOk()->json('message');

    expect($pinned['is_pinned'])->toBeTrue();

    $listed = $this->getJson(route('collections.items.chat.index', [$collection, $item]))
        ->assertOk()
        ->json();

    expect(collect($listed['pinned'])->pluck('id')->all())->toContain($id);

    $this->putJson(route('collections.items.chat.pin', [$collection, $item, $id]), [
        'pinned' => false,
    ])->assertOk()->assertJsonPath('message.is_pinned', false);
});

test('reaction toggle is unique per user and emoji', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $id = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'react',
    ])->assertCreated()->json('message.id');

    $added = $this->postJson(route('collections.items.chat.react', [$collection, $item, $id]), [
        'emoji' => '👍',
    ])->assertOk()->json();

    expect($added['added'])->toBeTrue()
        ->and($added['reactions'][0]['emoji'])->toBe('👍')
        ->and($added['reactions'][0]['count'])->toBe(1)
        ->and($added['reactions'][0]['reacted'])->toBeTrue()
        ->and($added['reactions'][0]['users'])->toHaveCount(1)
        ->and($added['reactions'][0]['users'][0]['id'])->toBe($user->id)
        ->and(CollectionItemChatReaction::query()->where('message_id', $id)->count())->toBe(1);

    $removed = $this->postJson(route('collections.items.chat.react', [$collection, $item, $id]), [
        'emoji' => '👍',
    ])->assertOk()->json();

    expect($removed['added'])->toBeFalse()
        ->and($removed['reactions'])->toBe([])
        ->and(CollectionItemChatReaction::query()->where('message_id', $id)->count())->toBe(0);

    $this->postJson(route('collections.items.chat.react', [$collection, $item, $id]), [
        'emoji' => '🔥',
    ])->assertUnprocessable();
});

test('old comments routes return 404', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $this->getJson("/collections/{$collection->id}/items/{$item->id}/comments")
        ->assertNotFound();
    $this->postJson("/collections/{$collection->id}/items/{$item->id}/comments", [
        'body' => 'nope',
    ])->assertNotFound();
});

test('chat message create and delete write lean activity log entries', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatKitchen();
    $this->actingAs($user);

    $messageId = $this->postJson(route('collections.items.chat.store', [$collection, $item]), [
        'body' => 'Audit me please',
    ])->assertCreated()->json('message.id');

    $created = Activity::query()
        ->where('event', 'chat_message')
        ->where('log_name', 'chat')
        ->latest('id')
        ->first();

    expect($created)->not->toBeNull()
        ->and($created->causer_id)->toBe($user->id)
        ->and($created->properties['body_preview'] ?? null)->toBe('Audit me please')
        ->and($created->properties['attachment_count'] ?? null)->toBe(0);

    $this->deleteJson(route('collections.items.chat.destroy', [$collection, $item, $messageId]))
        ->assertOk();

    $deleted = Activity::query()
        ->where('event', 'chat_message_deleted')
        ->where('log_name', 'chat')
        ->latest('id')
        ->first();

    expect($deleted)->not->toBeNull()
        ->and($deleted->properties['message_id'] ?? null)->toBe($messageId)
        ->and($deleted->properties['body_preview'] ?? null)->toBe('Audit me please');
});
