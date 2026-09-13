<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Support\AiToolTurnSummary;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageUsers;
use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
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
        ->assertJsonPath('model', config('ai.providers.local.models.text.default'));
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

test('manage collections tool creates updates and deletes a collection', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    ]);
    $this->actingAs($user);

    $createResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create',
        'name' => 'AI Posts',
        'slug' => 'ai-posts',
    ]));

    expect($createResult)->toContain('"ok": true');

    $collection = Collection::query()->where('slug', 'ai-posts')->first();
    expect($collection)->not->toBeNull();

    $updateResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'update',
        'collection_id' => $collection->id,
        'name' => 'AI Articles',
    ]));

    expect($updateResult)->toContain('"ok": true')
        ->and($collection->fresh()->name)->toBe('AI Articles');

    $deleteResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'delete',
        'collection_id' => $collection->id,
    ]));

    expect($deleteResult)->toContain('"ok": true')
        ->and(Collection::query()->find($collection->id))->toBeNull();
});

test('collection ai tools restore and force delete with permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanDeleteCollections->value,
        PermissionEnum::CanRestoreCollections->value,
        PermissionEnum::CanForceDeleteCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    (new ManageCollections)->handle(new Request([
        'action' => 'delete',
        'collection_id' => $collection->id,
    ]));

    $restoreCollectionResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'restore',
        'collection_id' => $collection->id,
    ]));

    expect($restoreCollectionResult)->toContain('"ok": true')
        ->and(Collection::query()->find($collection->id))->not->toBeNull()
        ->and(CollectionItem::query()->find($item->id))->not->toBeNull();

    $item->delete();

    $restoreItemResult = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'restore',
        'item_id' => $item->id,
    ]));

    expect($restoreItemResult)->toContain('"ok": true')
        ->and(CollectionItem::query()->find($item->id))->not->toBeNull();

    $item->delete();

    $forceDeleteItemResult = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'force_delete',
        'item_id' => $item->id,
    ]));

    expect($forceDeleteItemResult)->toContain('"ok": true')
        ->and(CollectionItem::query()->withTrashed()->find($item->id))->toBeNull();

    $collection->delete();

    $forceDeleteCollectionResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'force_delete',
        'collection_id' => $collection->id,
    ]));

    expect($forceDeleteCollectionResult)->toContain('"ok": true')
        ->and(Collection::query()->withTrashed()->find($collection->id))->toBeNull();
});

test('collection ai tools deny restore and force delete without permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $collection->delete();

    $results = [
        (string) (new ManageCollections)->handle(new Request([
            'action' => 'restore',
            'collection_id' => $collection->id,
        ])),
        (string) (new ManageCollections)->handle(new Request([
            'action' => 'force_delete',
            'collection_id' => $collection->id,
        ])),
        (string) (new ManageCollectionItems)->handle(new Request([
            'action' => 'restore',
            'item_id' => $item->id,
        ])),
        (string) (new ManageCollectionItems)->handle(new Request([
            'action' => 'force_delete',
            'item_id' => $item->id,
        ])),
    ];

    expect($results)->each->toContain('Missing permission');
    expect(Collection::query()->onlyTrashed()->find($collection->id))->not->toBeNull()
        ->and(CollectionItem::query()->onlyTrashed()->find($item->id))->not->toBeNull();
});

test('manage collections tool creates updates and deletes fields', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $createResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create_field',
        'collection_id' => $collection->id,
        'name' => 'seo_title',
        'type' => FieldTypeEnum::String->value,
        'translatable' => true,
        'settings_json' => '{"required":true}',
    ]));

    expect($createResult)->toContain('"ok": true')
        ->and($createResult)->toContain('seo_title');

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'seo_title')
        ->first();

    expect($field)->not->toBeNull()
        ->and($field->type)->toBe(FieldTypeEnum::String)
        ->and($field->translatable)->toBeTrue()
        ->and($field->settings)->toMatchArray(['required' => true]);

    $updateResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'update_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'name' => 'seo_description',
        'type' => FieldTypeEnum::Textarea->value,
        'translatable' => false,
    ]));

    expect($updateResult)->toContain('"ok": true');

    $field = $field->fresh();
    expect($field->name)->toBe('seo_description')
        ->and($field->type)->toBe(FieldTypeEnum::Textarea)
        ->and($field->translatable)->toBeFalse();

    $deleteResult = (string) (new ManageCollections)->handle(new Request([
        'action' => 'delete_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
    ]));

    expect($deleteResult)->toContain('"ok": true')
        ->and(CollectionField::query()->find($field->id))->toBeNull();
});

test('manage collections tool rejects invalid field type without throwing', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'create_field',
        'collection_id' => $collection->id,
        'name' => 'seo_title',
        'type' => 'not_a_real_type',
    ]));

    expect($result)->toStartWith('Error:')
        ->and(CollectionField::query()->where('collection_id', $collection->id)->exists())->toBeFalse();
});

test('manage collection items tool updates and deletes with permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    $item = $collection->items()->create([]);

    $updateResult = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'update',
        'item_id' => $item->id,
        'data_json' => '{"title":"Hello from AI"}',
    ]));

    expect($updateResult)->toContain('"ok": true')
        ->and($updateResult)->toContain('Hello from AI');

    $deleteResult = (string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'delete',
        'item_id' => $item->id,
    ]));

    expect($deleteResult)->toContain('"ok": true')
        ->and(CollectionItem::query()->find($item->id))->toBeNull();
});

test('manage files tool creates a folder with permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'AiFolder',
    ]));

    expect($result)->toContain('"ok": true')
        ->and(File::query()->where('name', 'AiFolder')->where('type', FileTypeEnum::Folder)->exists())->toBeTrue();
});

test('manage files tool can bulk move root children with move_many', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);
    $this->actingAs($user);

    $a = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'BulkA',
    ])), true);
    $b = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'BulkB',
    ])), true);
    $target = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'Prova',
    ])), true);

    $result = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'move_many',
        'source_parent_id' => 0,
        'target_parent_id' => $target['file']['id'],
    ])), true);

    expect($result['ok'] ?? false)->toBeTrue()
        ->and(collect($result['moved'] ?? [])->pluck('id'))->toContain($a['file']['id'], $b['file']['id'])
        ->and(collect($result['moved'] ?? [])->pluck('id'))->not->toContain($target['file']['id']);

    $this->assertDatabaseHas('files', [
        'id' => $a['file']['id'],
        'parent_id' => $target['file']['id'],
    ]);
    $this->assertDatabaseHas('files', [
        'id' => $b['file']['id'],
        'parent_id' => $target['file']['id'],
    ]);
    $this->assertDatabaseHas('files', [
        'id' => $target['file']['id'],
        'parent_id' => null,
    ]);
});

test('manage files tool can move a folder and list serialized cards', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);
    $this->actingAs($user);

    $parent = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'AiParent',
    ])), true);
    $child = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'create_folder',
        'name' => 'AiChild',
        'parent_id' => 0,
    ])), true);

    $moveResult = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'move',
        'file_id' => $child['file']['id'],
        'target_parent_id' => $parent['file']['id'],
    ])), true);

    expect($moveResult['ok'] ?? false)->toBeTrue()
        ->and($moveResult['file']['parent_id'] ?? null)->toBe($parent['file']['id'])
        ->and($moveResult['file']['type'] ?? null)->toBe('folder');

    $listResult = json_decode((string) (new ManageFiles)->handle(new Request([
        'action' => 'list',
        'parent_id' => $parent['file']['id'],
    ])), true);

    expect($listResult['ok'] ?? false)->toBeTrue()
        ->and(collect($listResult['files'] ?? [])->pluck('id'))->toContain($child['file']['id'])
        ->and($listResult['files'][0])->toHaveKeys(['id', 'name', 'type', 'url']);

    $this->assertDatabaseHas('files', [
        'id' => $child['file']['id'],
        'parent_id' => $parent['file']['id'],
    ]);
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

test('stop cancel truncates last matching user message via show then truncate', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $keptUserId = (string) Str::uuid7();
    $keptAssistantId = (string) Str::uuid7();
    $stoppedUserId = (string) Str::uuid7();
    $stoppedPrompt = 'Please cancel this turn';

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Stop cancel chat',
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
        'id' => $keptUserId,
        'role' => 'user',
        'content' => 'Kept question',
        'created_at' => now()->subMinutes(2),
        'updated_at' => now()->subMinutes(2),
    ]);
    ConversationMessage::query()->create([
        ...$base,
        'id' => $keptAssistantId,
        'role' => 'assistant',
        'content' => 'Kept answer',
        'created_at' => now()->subMinute(),
        'updated_at' => now()->subMinute(),
    ]);
    ConversationMessage::query()->create([
        ...$base,
        'id' => $stoppedUserId,
        'role' => 'user',
        'content' => $stoppedPrompt."\n\n[AI_ATTACHMENTS]\n- attachment_id=x\n[/AI_ATTACHMENTS]",
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $messages = $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->json('messages');

    $lastUser = collect($messages)->reverse()->first(
        fn (array $message): bool => ($message['role'] ?? null) === 'user',
    );

    expect($lastUser)->not->toBeNull()
        ->and(str_starts_with(trim((string) $lastUser['content']), $stoppedPrompt))->toBeTrue();

    $this->actingAs($user)
        ->postJson(route('ai.conversations.truncate', $conversationId), [
            'from_message_id' => $lastUser['id'],
        ])
        ->assertOk()
        ->assertJsonPath('deleted', 1);

    expect(ConversationMessage::query()->where('conversation_id', $conversationId)->pluck('id')->all())
        ->toBe([$keptUserId, $keptAssistantId]);
});

test('app assistant tools are filtered by user permissions', function () {
    $limited = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $tools = collect((new AppAssistant($limited))->tools())
        ->map(fn ($tool) => $tool::class)
        ->all();

    expect($tools)->toContain(ManageCollections::class)
        ->and($tools)->toContain(ManageCollectionItems::class)
        ->and($tools)->not->toContain(ImportCollectionCsv::class)
        ->and($tools)->not->toContain(ImportRemoteJson::class)
        ->and($tools)->not->toContain(ManageFiles::class)
        ->and($tools)->not->toContain(ManageUsers::class);

    $aiOnly = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    expect(collect((new AppAssistant($aiOnly))->tools())->all())->toBeEmpty();
});

test('manage users tool denies create without CanCreateUsers', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowUsers->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageUsers)->handle(new Request([
        'action' => 'create',
        'first_name' => 'Blocked',
        'email' => 'blocked.ai@example.com',
        'password' => 'password',
    ]));

    expect($result)->toContain('Missing permission')
        ->and($result)->toContain(PermissionEnum::CanCreateUsers->value)
        ->and(User::query()->where('email', 'blocked.ai@example.com')->exists())->toBeFalse();
});

test('manage users tool creates user with CanCreateUsers', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateUsers->value,
    ]);
    $this->actingAs($actor);

    $result = (string) (new ManageUsers)->handle(new Request([
        'action' => 'create',
        'first_name' => 'Ai',
        'last_name' => 'Created',
        'email' => 'ai.created@example.com',
        'password' => 'password',
    ]));

    expect($result)->toContain('"ok": true')
        ->and(User::query()->where('email', 'ai.created@example.com')->exists())->toBeTrue();
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

test('app assistant max steps covers all field types plus buffer', function () {
    $assistant = new AppAssistant(User::factory()->create());

    expect($assistant->maxSteps())->toBe(count(FieldTypeEnum::cases()) + 16)
        ->and($assistant->maxSteps())->toBeGreaterThan(count(FieldTypeEnum::cases()) + 1)
        ->and($assistant->timeout())->toBe(300);
});

test('empty assistant message with tool results gets a settled summary on the ai page', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $conversationId = (string) Str::uuid7();
    $messageId = (string) Str::uuid7();

    Conversation::query()->create([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Empty tool turn',
    ]);

    ConversationMessage::query()->create([
        'id' => $messageId,
        'conversation_id' => $conversationId,
        'user_id' => $user->id,
        'agent' => AppAssistant::class,
        'role' => 'assistant',
        'content' => '',
        'attachments' => [],
        'tool_calls' => [
            [
                'id' => 'call_1',
                'name' => 'ManageCollections',
                'arguments' => ['action' => 'create', 'name' => 'test campi'],
            ],
        ],
        'tool_results' => [
            [
                'id' => 'call_1',
                'name' => 'ManageCollections',
                'result' => '{"ok": true, "collection": {"id": 1}}',
            ],
        ],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($user)
        ->get(route('ai.show', $conversationId))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->where('messages.0.content', fn (string $content): bool => str_contains($content, 'Completed via')
                && str_contains($content, 'ManageCollections')));

    $json = $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->json('messages.0.content');

    expect($json)->toBeString()->toContain('Completed via');
});

test('ai tool turn summary marks successful tool results', function () {
    $summary = AiToolTurnSummary::fromTools(
        [['name' => 'ManageCollections']],
        [['name' => 'ManageCollections', 'result' => '{"ok": true}']],
    );

    expect($summary)->toContain('Completed via')
        ->and($summary)->toContain('ManageCollections')
        ->and($summary)->toContain('1/1');
});
