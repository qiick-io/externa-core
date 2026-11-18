<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

/**
 * The chat form requests check access in authorize(), before validating:
 * a caller without access gets 403 / 422 for the thread, never a validation
 * error that reveals the payload shape of a thread they cannot see.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
});

function authorizationOrderUsers(): array
{
    $permissions = [
        ...allCollectionPermissions(),
        PermissionEnum::CanShowChat->value,
        PermissionEnum::CanCreateDirectChats->value,
    ];

    return [
        'owner' => grantCollectionPermissions(User::factory()->create(), $permissions),
        'participant' => grantCollectionPermissions(User::factory()->create(), $permissions),
        'stranger' => grantCollectionPermissions(User::factory()->create(), $permissions),
    ];
}

test('a non-participant gets 403 before an invalid payload is validated', function (): void {
    ['owner' => $owner, 'participant' => $participant, 'stranger' => $stranger] = authorizationOrderUsers();

    $chatId = test()->actingAs($owner)
        ->postJson(route('chat.threads.store'), ['kind' => Chat::KIND_DIRECT, 'user_ids' => [$participant->id]])
        ->assertCreated()
        ->json('chat.id');
    $messageId = test()->actingAs($owner)
        ->postJson(route('chat.messages.store', $chatId), ['body' => 'hello'])
        ->assertCreated()
        ->json('message.id');

    test()->actingAs($stranger)->getJson(route('chat.messages.index', [$chatId, 'per_page' => 'many']))->assertForbidden();
    test()->actingAs($stranger)->postJson(route('chat.messages.store', $chatId), ['body' => ['not', 'a', 'string']])->assertForbidden();
    test()->actingAs($stranger)->patchJson(route('chat.messages.update', [$chatId, $messageId]), [])->assertForbidden();
    test()->actingAs($stranger)->putJson(route('chat.messages.pin', [$chatId, $messageId]), [])->assertForbidden();
    test()->actingAs($stranger)->postJson(route('chat.messages.react', [$chatId, $messageId]), [])->assertForbidden();
    test()->actingAs($stranger)->postJson(route('chat.attachments.uploads.init', $chatId), [])->assertForbidden();
    test()->actingAs($stranger)->postJson(route('chat.participants.store', $chatId), ['user_ids' => 'nope'])->assertForbidden();

    // A participant who is not the author is refused before validation too.
    test()->actingAs($participant)->patchJson(route('chat.messages.update', [$chatId, $messageId]), [])->assertForbidden();

    // Notification subscriptions exist only for item threads.
    test()->actingAs($owner)->putJson(route('chat.notify', $chatId), [])->assertStatus(422)->assertJsonMissingValidationErrors('notify');
});

test('the people directory needs the direct chat permission before validation', function (): void {
    $user = grantCollectionPermissions(User::factory()->create(), [PermissionEnum::CanShowChat->value]);

    test()->actingAs($user)->getJson(route('chat.options.directory', ['per_page' => 'many']))->assertForbidden();
});
