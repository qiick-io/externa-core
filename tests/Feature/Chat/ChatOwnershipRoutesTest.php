<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function ownershipKitchen(): array
{
    $permissions = [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
        PermissionEnum::CanCreateDirectChats->value,
    ];
    $owner = grantCollectionPermissions(User::factory()->create(), $permissions);
    $participant = grantCollectionPermissions(User::factory()->create([
        'first_name' => 'Peer',
        'last_name' => 'User',
    ]), $permissions);
    $stranger = grantCollectionPermissions(User::factory()->create([
        'first_name' => 'Stranger',
        'last_name' => 'User',
    ]), $permissions);
    $collection = Collection::factory()->create(['name' => 'Ownership']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    return compact('owner', 'participant', 'stranger', 'collection');
}

function ownershipDirectChat(User $owner, User $participant): string
{
    return test()->actingAs($owner)
        ->postJson(route('chat.threads.store'), [
            'kind' => Chat::KIND_DIRECT,
            'user_ids' => [$participant->id],
        ])
        ->assertCreated()
        ->json('chat.id');
}

test('message owner can update delete and pin; peer and stranger cannot mutate ownership routes', function () {
    ['owner' => $owner, 'participant' => $participant, 'stranger' => $stranger] = ownershipKitchen();
    $chatId = ownershipDirectChat($owner, $participant);

    $messageId = test()->actingAs($owner)
        ->postJson(route('chat.messages.store', $chatId), ['body' => 'original'])
        ->assertCreated()
        ->json('message.id');

    // Happy paths — owner
    test()->actingAs($owner)
        ->patchJson(route('chat.messages.update', [$chatId, $messageId]), ['body' => 'edited'])
        ->assertOk()
        ->assertJsonPath('message.body', 'edited');

    test()->actingAs($owner)
        ->putJson(route('chat.messages.pin', [$chatId, $messageId]), ['pinned' => true])
        ->assertOk()
        ->assertJsonPath('message.is_pinned', true);

    // Non-owner participant: update/delete 403; pin allowed (any participant)
    test()->actingAs($participant)
        ->patchJson(route('chat.messages.update', [$chatId, $messageId]), ['body' => 'hijack'])
        ->assertForbidden();

    test()->actingAs($participant)
        ->deleteJson(route('chat.messages.destroy', [$chatId, $messageId]))
        ->assertForbidden();

    test()->actingAs($participant)
        ->putJson(route('chat.messages.pin', [$chatId, $messageId]), ['pinned' => false])
        ->assertOk()
        ->assertJsonPath('message.is_pinned', false);

    // Non-participant: all listed routes 403
    test()->actingAs($stranger)
        ->patchJson(route('chat.messages.update', [$chatId, $messageId]), ['body' => 'nope'])
        ->assertForbidden();

    test()->actingAs($stranger)
        ->deleteJson(route('chat.messages.destroy', [$chatId, $messageId]))
        ->assertForbidden();

    test()->actingAs($stranger)
        ->putJson(route('chat.messages.pin', [$chatId, $messageId]), ['pinned' => true])
        ->assertForbidden();

    // Owner deletes (happy path)
    test()->actingAs($owner)
        ->deleteJson(route('chat.messages.destroy', [$chatId, $messageId]))
        ->assertOk();
});

test('orphan attachment show/delete requires owner; stranger and peer denied', function () {
    Storage::fake('local');
    ['owner' => $owner, 'participant' => $participant, 'stranger' => $stranger] = ownershipKitchen();
    $chatId = ownershipDirectChat($owner, $participant);

    $path = 'chat-uploads/'.$owner->id.'/orphan.txt';
    Storage::disk('local')->put($path, 'secret');

    $attachment = CollectionItemChatAttachment::query()->create([
        'message_id' => null,
        'user_id' => $owner->id,
        'original_name' => 'orphan.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => $path,
        'size' => 6,
        'expires_at' => now()->addHour(),
    ]);

    // Happy path — owner can read + delete orphan
    test()->actingAs($owner)
        ->get(route('chat.attachments.show', [$chatId, $attachment->id]))
        ->assertOk();

    // Peer / stranger cannot delete orphan they do not own
    test()->actingAs($participant)
        ->deleteJson(route('chat.attachments.destroy', [$chatId, $attachment->id]))
        ->assertForbidden();

    test()->actingAs($stranger)
        ->get(route('chat.attachments.show', [$chatId, $attachment->id]))
        ->assertForbidden();

    test()->actingAs($stranger)
        ->deleteJson(route('chat.attachments.destroy', [$chatId, $attachment->id]))
        ->assertForbidden();

    test()->actingAs($owner)
        ->deleteJson(route('chat.attachments.destroy', [$chatId, $attachment->id]))
        ->assertNoContent();

    expect(CollectionItemChatAttachment::query()->find($attachment->id))->toBeNull();
});
