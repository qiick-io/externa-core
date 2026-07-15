<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageFiles;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;

function grantAiPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-ai-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests cannot access ai routes', function () {
    $this->get(route('ai.index'))->assertRedirect(route('login'));
    $this->getJson(route('ai.status'))->assertUnauthorized();
    $this->postJson(route('ai.chat'), ['message' => 'hi'])->assertUnauthorized();
});

test('users without can-use-ai are forbidden', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('ai.index'))->assertForbidden();
    $this->getJson(route('ai.status'))->assertForbidden();
});

test('ai status reports offline when lm studio is unreachable', function () {
    Http::fake([
        'http://127.0.0.1:1234/v1/models' => Http::response(null, 500),
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->getJson(route('ai.status'))
        ->assertOk()
        ->assertJsonPath('online', false);
});

test('ai status reports online when models endpoint succeeds', function () {
    Http::fake([
        'http://127.0.0.1:1234/v1/models' => Http::response([
            'data' => [
                ['id' => 'local-model'],
            ],
        ], 200),
    ]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->getJson(route('ai.status'))
        ->assertOk()
        ->assertJsonPath('online', true)
        ->assertJsonPath('model', 'local-model');
});

test('users only see their own conversations', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $other = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $ownedId = (string) Str::uuid7();
    $foreignId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $ownedId,
        'user_id' => $owner->id,
        'title' => 'Mine',
    ]);
    Conversation::query()->create([
        'id' => $foreignId,
        'user_id' => $other->id,
        'title' => 'Theirs',
    ]);

    $this->actingAs($owner)
        ->getJson(route('ai.conversations.index'))
        ->assertOk()
        ->assertJsonFragment(['id' => $ownedId])
        ->assertJsonMissing(['id' => $foreignId]);

    $this->actingAs($owner)
        ->getJson(route('ai.conversations.show', $foreignId))
        ->assertNotFound();
});

test('manage files tool denies create without permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'Blocked',
    ]));

    expect($result)->toContain('Missing permission')
        ->and(File::query()->where('name', 'Blocked')->exists())->toBeFalse();

    expect(Activity::query()->where('event', 'ai_tool')->where('log_name', 'ai')->exists())->toBeTrue();
});

test('manage files tool can soft delete and restore with permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanDeleteFiles->value,
        PermissionEnum::CanRestoreFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Temp',
        'path' => '/Temp',
        'disk' => 'assets',
    ]);

    $deleteResult = (string) (new ManageFiles)->handle(new Request([
        'action' => 'delete',
        'file_id' => $file->id,
    ]));

    expect($deleteResult)->toContain('"ok": true')
        ->and(File::query()->find($file->id))->toBeNull()
        ->and(File::query()->onlyTrashed()->find($file->id))->not->toBeNull();

    $restoreResult = (string) (new ManageFiles)->handle(new Request([
        'action' => 'restore',
        'file_id' => $file->id,
    ]));

    expect($restoreResult)->toContain('"ok": true')
        ->and(File::query()->find($file->id))->not->toBeNull();

    expect(Activity::query()->where('event', 'ai_mutation')->where('log_name', 'ai')->exists())->toBeTrue();
});

test('manage collection items tool creates item with permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $result = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'create',
        'collection_id' => $collection->id,
        'data_json' => '{}',
    ]));

    expect($result)->toContain('"ok": true')
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(1);

    expect(Activity::query()->where('event', 'ai_tool')->where('log_name', 'ai')->exists())->toBeTrue();
});

test('chat stream endpoint logs prompt and response when faked', function () {
    AppAssistant::fake(['Hello from assistant']);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $response = $this->post(route('ai.chat'), [
        'message' => 'Ping the assistant',
    ]);

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('text/event-stream');

    $content = $response->streamedContent();
    expect($content)->toContain('data:');
    expect($content)->toContain('"type":"text_delta"');
    expect($content)->toContain('"delta":"Hello"');
    expect($content)->toContain('"type":"conversation"');
    expect($content)->toContain('"conversation_id"');
    expect($content)->toContain('data: [DONE]');

    expect(Activity::query()->where('event', 'ai_prompt')->where('log_name', 'ai')->exists())->toBeTrue();
    expect(Activity::query()->where('event', 'ai_response')->where('log_name', 'ai')->exists())->toBeTrue();

    AppAssistant::assertPrompted('Ping the assistant');
});

test('ai page normalizes array message content parts to plain text', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $messageId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Parts chat',
    ]);

    ConversationMessage::query()->create([
        'id' => $messageId,
        'conversation_id' => $conversationId,
        'user_id' => $user->id,
        'agent' => AppAssistant::class,
        'role' => 'assistant',
        'content' => json_encode([
            ['type' => 'output_text', 'text' => 'Hello '],
            ['type' => 'output_text', 'text' => 'world'],
        ], JSON_THROW_ON_ERROR),
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($user)
        ->get(route('ai.show', $conversationId))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->where('messages.0.content', 'Hello world'));
});

test('ai page loads conversation with array tool_calls without error', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $messageId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Tool chat',
    ]);

    ConversationMessage::query()->create([
        'id' => $messageId,
        'conversation_id' => $conversationId,
        'user_id' => $user->id,
        'agent' => AppAssistant::class,
        'role' => 'assistant',
        'content' => 'Used a tool',
        'attachments' => [],
        'tool_calls' => [
            [
                'id' => 'call_1',
                'type' => 'function',
                'function' => [
                    'name' => 'manage_files',
                    'arguments' => '{"action":"list"}',
                ],
            ],
        ],
        'tool_results' => [
            ['tool_call_id' => 'call_1', 'content' => '{"ok":true}'],
        ],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($user)
        ->get(route('ai.show', $conversationId))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->where('selectedConversation.id', $conversationId)
            ->has('messages', 1)
            ->where('messages.0.content', 'Used a tool')
            ->where('messages.0.tool_calls.0.id', 'call_1'));

    $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->assertJsonPath('messages.0.content', 'Used a tool')
        ->assertJsonPath('messages.0.tool_calls.0.id', 'call_1')
        ->assertJsonPath('messages.0.tool_results.0.tool_call_id', 'call_1');
});

test('ai show route returns 404 for foreign conversations', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $intruder = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $owner->id,
        'title' => 'Private',
    ]);

    $this->actingAs($intruder)
        ->get(route('ai.show', $conversationId))
        ->assertNotFound();
});

test('users can pin and unpin their conversations', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Pin me',
    ]);

    $this->actingAs($user)
        ->postJson(route('ai.conversations.pin', $conversationId))
        ->assertOk()
        ->assertJsonPath('ok', true);

    expect(Conversation::query()->find($conversationId)?->pinned_at)->not->toBeNull();

    $this->actingAs($user)
        ->postJson(route('ai.conversations.pin', $conversationId))
        ->assertOk();

    expect(Conversation::query()->find($conversationId)?->pinned_at)->toBeNull();
});

test('pin is forbidden for foreign conversations', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $intruder = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $owner->id,
        'title' => 'Not yours',
    ]);

    $this->actingAs($intruder)
        ->postJson(route('ai.conversations.pin', $conversationId))
        ->assertNotFound();
});

test('users can bulk delete owned conversations only', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $other = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $firstId = (string) Str::uuid7();
    $secondId = (string) Str::uuid7();
    $foreignId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $firstId,
        'user_id' => $owner->id,
        'title' => 'One',
    ]);
    Conversation::query()->create([
        'id' => $secondId,
        'user_id' => $owner->id,
        'title' => 'Two',
    ]);
    Conversation::query()->create([
        'id' => $foreignId,
        'user_id' => $other->id,
        'title' => 'Foreign',
    ]);

    $this->actingAs($owner)
        ->postJson(route('ai.conversations.bulk-destroy'), [
            'ids' => [$firstId, $foreignId],
        ])
        ->assertNotFound();

    expect(Conversation::query()->whereIn('id', [$firstId, $foreignId])->count())->toBe(2);

    $this->actingAs($owner)
        ->postJson(route('ai.conversations.bulk-destroy'), [
            'ids' => [$firstId, $secondId],
        ])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('deleted', 2);

    expect(Conversation::query()->whereIn('id', [$firstId, $secondId])->exists())->toBeFalse();
});

test('chat stream with existing conversation id continues owned chat', function () {
    AppAssistant::fake(['Continued reply']);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Ongoing',
    ]);

    $this->actingAs($user);

    $response = $this->post(route('ai.chat'), [
        'message' => 'Continue please',
        'conversation_id' => $conversationId,
    ]);

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('text/event-stream');

    $content = $response->streamedContent();
    expect($content)->toContain('data:');
    expect($content)->toContain('"conversation_id"');
    expect($content)->toContain($conversationId);
    expect($content)->toContain('data: [DONE]');

    AppAssistant::assertPrompted('Continue please');
});

test('chat stream rejects foreign conversation id', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $intruder = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $owner->id,
        'title' => 'Secret',
    ]);

    $this->actingAs($intruder)
        ->postJson(route('ai.chat'), [
            'message' => 'Hijack',
            'conversation_id' => $conversationId,
        ])
        ->assertNotFound();
});

test('ai page renders for authorized users', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $this->get(route('ai.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->has('conversations.data')
            ->has('conversations.current_page')
            ->has('conversations.last_page')
            ->where('conversations.per_page', 25)
            ->has('messages'));
});

test('ai conversations index is paginated', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    foreach (range(1, 30) as $index) {
        Conversation::query()->create([
            'id' => (string) Str::uuid7(),
            'user_id' => $user->id,
            'title' => "Chat {$index}",
        ]);
    }

    $this->actingAs($user)
        ->getJson(route('ai.conversations.index', ['per_page' => 25]))
        ->assertOk()
        ->assertJsonPath('per_page', 25)
        ->assertJsonPath('current_page', 1)
        ->assertJsonPath('last_page', 2)
        ->assertJsonPath('total', 30)
        ->assertJsonCount(25, 'data');

    $this->actingAs($user)
        ->getJson(route('ai.conversations.index', ['page' => 2, 'per_page' => 25]))
        ->assertOk()
        ->assertJsonPath('current_page', 2)
        ->assertJsonCount(5, 'data');

    $this->actingAs($user)
        ->get(route('ai.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->has('conversations.data', 25)
            ->where('conversations.last_page', 2)
            ->where('conversations.total', 30));
});

test('conversation truncate deletes message and subsequent turns', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $firstUserId = (string) Str::uuid7();
    $firstAssistantId = (string) Str::uuid7();
    $secondUserId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Truncate chat',
    ]);

    $base = [
        'conversation_id' => $conversationId,
        'user_id' => $user->id,
        'agent' => AppAssistant::class,
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ];

    ConversationMessage::query()->create([
        ...$base,
        'id' => $firstUserId,
        'role' => 'user',
        'content' => 'First question',
        'created_at' => now()->subMinutes(3),
        'updated_at' => now()->subMinutes(3),
    ]);
    ConversationMessage::query()->create([
        ...$base,
        'id' => $firstAssistantId,
        'role' => 'assistant',
        'content' => 'First answer',
        'created_at' => now()->subMinutes(2),
        'updated_at' => now()->subMinutes(2),
    ]);
    ConversationMessage::query()->create([
        ...$base,
        'id' => $secondUserId,
        'role' => 'user',
        'content' => 'Second question',
        'created_at' => now()->subMinute(),
        'updated_at' => now()->subMinute(),
    ]);

    $this->actingAs($user)
        ->postJson(route('ai.conversations.truncate', $conversationId), [
            'from_message_id' => $firstAssistantId,
        ])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('deleted', 2);

    expect(ConversationMessage::query()->where('conversation_id', $conversationId)->pluck('id')->all())
        ->toBe([$firstUserId]);
});

test('conversation truncate is forbidden for foreign conversations', function () {
    $owner = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $intruder = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $messageId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $owner->id,
        'title' => 'Private',
    ]);

    ConversationMessage::query()->create([
        'id' => $messageId,
        'conversation_id' => $conversationId,
        'user_id' => $owner->id,
        'agent' => AppAssistant::class,
        'role' => 'user',
        'content' => 'Secret',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($intruder)
        ->postJson(route('ai.conversations.truncate', $conversationId), [
            'from_message_id' => $messageId,
        ])
        ->assertNotFound();
});
