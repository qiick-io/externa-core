<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ManageAiSyncSources;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
use App\Ai\Tools\ManageUsers;
use App\Ai\Tools\RollbackLastAiTurn;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Contracts\Approvable;
use Laravel\Ai\Enums\MessageStatus;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * Recreate the pre-1.0 (laravel/ai 0.7) conversation tables with user_id + tool_calls/tool_results.
 */
function createLegacyAgentConversationTables(): void
{
    Schema::dropIfExists('agent_conversation_messages');
    Schema::dropIfExists('agent_conversations');

    Schema::create('agent_conversations', function (Blueprint $table) {
        $table->string('id', 36)->primary();
        $table->foreignId('user_id')->nullable();
        $table->string('title');
        $table->timestamp('pinned_at')->nullable();
        $table->timestamps();

        $table->index(['user_id', 'updated_at']);
        $table->index(['user_id', 'pinned_at']);
    });

    Schema::create('agent_conversation_messages', function (Blueprint $table) {
        $table->string('id', 36)->primary();
        $table->string('conversation_id', 36)->index();
        $table->foreignId('user_id')->nullable();
        $table->string('agent');
        $table->string('role', 25);
        $table->text('content');
        $table->text('attachments');
        $table->text('tool_calls');
        $table->text('tool_results');
        $table->text('usage');
        $table->text('meta');
        $table->timestamps();

        $table->index(['conversation_id', 'user_id', 'updated_at'], 'conversation_index');
        $table->index(['user_id']);
    });
}

function laravelAiUpgradeMigration(): object
{
    return require database_path('migrations/2026_09_23_000001_upgrade_agent_conversations_for_laravel_ai_1_0.php');
}

test('upgrade migration converts legacy user_id and tool columns to participant and steps', function () {
    $user = User::factory()->create();
    createLegacyAgentConversationTables();

    $conversationId = (string) Str::uuid7();
    $userMessageId = (string) Str::uuid7();
    $assistantMessageId = (string) Str::uuid7();

    DB::table('agent_conversations')->insert([
        'id' => $conversationId,
        'user_id' => $user->id,
        'title' => 'Legacy chat',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $base = [
        'conversation_id' => $conversationId,
        'user_id' => $user->id,
        'agent' => AppAssistant::class,
        'attachments' => '[]',
        'usage' => '[]',
        'created_at' => now(),
        'updated_at' => now(),
    ];

    DB::table('agent_conversation_messages')->insert([
        ...$base,
        'id' => $userMessageId,
        'role' => 'user',
        'content' => 'Create a collection',
        'tool_calls' => '[]',
        'tool_results' => '[]',
        'meta' => '[]',
    ]);
    DB::table('agent_conversation_messages')->insert([
        ...$base,
        'id' => $assistantMessageId,
        'role' => 'assistant',
        'content' => 'Created.',
        'tool_calls' => json_encode([['id' => 'call_1', 'name' => 'ManageCollections', 'arguments' => ['action' => 'create']]]),
        'tool_results' => json_encode([['id' => 'call_1', 'name' => 'ManageCollections', 'arguments' => ['action' => 'create'], 'result' => '{"ok":true}']]),
        'meta' => json_encode(['provider' => 'local', 'reasoning' => 'thinking']),
    ]);

    laravelAiUpgradeMigration()->up();

    expect(Schema::hasColumns('agent_conversations', ['participant_type', 'participant_id', 'pinned_at']))->toBeTrue()
        ->and(Schema::hasColumn('agent_conversations', 'user_id'))->toBeFalse()
        ->and(Schema::hasColumns('agent_conversation_messages', ['participant_type', 'participant_id', 'steps', 'status']))->toBeTrue()
        ->and(Schema::hasColumn('agent_conversation_messages', 'tool_calls'))->toBeFalse()
        ->and(Schema::hasColumn('agent_conversation_messages', 'tool_results'))->toBeFalse()
        ->and(Schema::hasIndex('agent_conversation_messages', ['participant_type', 'participant_id', 'agent']))->toBeTrue();

    expect($user->conversations()->pluck('id')->all())->toBe([$conversationId]);

    $assistant = ConversationMessage::query()->findOrFail($assistantMessageId);

    expect($assistant->status)->toBe(MessageStatus::Completed)
        ->and($assistant->participant_type)->toBe($user->getMorphClass())
        ->and($assistant->steps)->toHaveCount(2)
        ->and($assistant->steps[1]['content'])->toBe('Created.')
        ->and($assistant->steps[1]['reasoning'])->toBe('thinking')
        ->and($assistant->tool_calls[0]['id'])->toBe('call_1')
        ->and($assistant->tool_results[0]['result'])->toBe('{"ok":true}')
        ->and($assistant->meta)->not->toHaveKey('reasoning');

    expect(ConversationMessage::query()->findOrFail($userMessageId)->steps)->toBe([]);

    // Running again on the 1.0 schema is a no-op.
    laravelAiUpgradeMigration()->up();

    expect(ConversationMessage::query()->count())->toBe(2);
});

test('upgrade migration is a no-op on the fresh 1.0 schema and reversible', function () {
    laravelAiUpgradeMigration()->up();

    expect(Schema::hasColumn('agent_conversations', 'user_id'))->toBeFalse()
        ->and(Schema::hasColumn('agent_conversation_messages', 'steps'))->toBeTrue();

    $user = User::factory()->create();
    $conversationId = (string) Str::uuid7();

    $user->conversations()->create(['id' => $conversationId, 'title' => 'Reversible']);

    ConversationMessage::query()->create([
        'id' => (string) Str::uuid7(),
        'conversation_id' => $conversationId,
        'participant_type' => $user->getMorphClass(),
        'participant_id' => $user->id,
        'agent' => AppAssistant::class,
        'role' => 'assistant',
        'content' => '',
        'attachments' => [],
        'steps' => [[
            'content' => '',
            'tool_calls' => [['id' => 'call_9', 'name' => 'ManageFiles', 'arguments' => ['action' => 'list'], 'result' => '{"ok":true}']],
            'reasoning' => '',
            'replay_blocks' => [],
            'provider_tool_calls' => [],
        ]],
        'usage' => [],
        'meta' => [],
        'status' => MessageStatus::Completed,
    ]);

    laravelAiUpgradeMigration()->down();

    $row = DB::table('agent_conversation_messages')->first();

    expect(Schema::hasColumn('agent_conversations', 'user_id'))->toBeTrue()
        ->and(Schema::hasColumn('agent_conversation_messages', 'steps'))->toBeFalse()
        ->and((int) $row->user_id)->toBe($user->id)
        ->and(json_decode($row->tool_calls, true)[0])->not->toHaveKey('result')
        ->and(json_decode($row->tool_results, true)[0]['result'])->toBe('{"ok":true}');
});

test('destructive tool actions require approval while reads run straight through', function (Approvable $tool, string $destructive, string $safe) {
    expect($tool->shouldRequestApproval(new Request(['action' => $destructive])))->toBeInstanceOf(Approval::class)
        ->and($tool->shouldRequestApproval(new Request(['action' => $destructive]))->reason)->toContain($destructive)
        ->and($tool->shouldRequestApproval(new Request(['action' => $safe])))->toBeNull();
})->with([
    'collections delete' => [fn () => new ManageCollections, 'delete', 'list'],
    'collections delete_field' => [fn () => new ManageCollections, 'delete_field', 'create_field'],
    'items bulk_delete' => [fn () => new ManageCollectionItems, 'bulk_delete', 'list'],
    'files force_delete' => [fn () => new ManageFiles, 'force_delete', 'move'],
    'users delete' => [fn () => new ManageUsers, 'delete', 'restore'],
    'roles delete' => [fn () => new ManageRoles, 'delete', 'list_permissions'],
    'groups force_delete' => [fn () => new ManageGroups, 'force_delete', 'update'],
    'sync sources delete' => [fn () => new ManageAiSyncSources, 'delete', 'list'],
]);

test('rollback last ai turn always requires approval', function () {
    expect((new RollbackLastAiTurn)->shouldRequestApproval(new Request(['conversation_id' => 'x'])))
        ->toBeInstanceOf(Approval::class);
});

test('destructive tool call pauses the chat stream and exposes pending approvals', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDeleteFiles->value,
    ]);
    $file = File::query()->create([
        'name' => 'keep-me.txt',
        'type' => FileTypeEnum::File,
        'path' => 'files/keep-me.txt',
        'mime_type' => 'text/plain',
        'size' => 4,
        'created_by' => $user->id,
    ]);

    AppAssistant::fake([
        new ToolCall('call_delete', 'ManageFiles', ['action' => 'delete', 'file_id' => $file->id]),
        'Deleted.',
    ]);

    $this->actingAs($user);

    $content = $this->post(route('ai.chat'), ['message' => 'Delete keep-me.txt'])
        ->assertOk()
        ->streamedContent();

    expect($content)->toContain('"type":"tool_approval_request"')
        ->and($content)->toContain('call_delete')
        ->and($content)->toContain('data: [DONE]');

    expect(File::query()->whereKey($file->id)->exists())->toBeTrue();

    $conversation = Conversation::query()->firstOrFail();
    $paused = ConversationMessage::query()
        ->where('conversation_id', $conversation->id)
        ->where('role', 'assistant')
        ->firstOrFail();

    expect($paused->status)->toBe(MessageStatus::Paused);

    $this->getJson(route('ai.conversations.show', $conversation->id))
        ->assertOk()
        ->assertJsonPath('messages.1.pending_approvals.0.id', 'call_delete')
        ->assertJsonPath('messages.1.pending_approvals.0.tool', 'ManageFiles')
        ->assertJsonPath('messages.1.content', 'Waiting for your approval to run ManageFiles.');

    $this->get(route('ai.show', $conversation->id))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('ai/index')
            ->where('messages.1.pending_approvals.0.id', 'call_delete'));

    $this->postJson(route('ai.chat'), [
        'conversation_id' => $conversation->id,
        'approvals' => [['id' => 'call_unknown', 'approved' => true]],
    ])->assertUnprocessable();

    $resume = $this->post(route('ai.chat'), [
        'conversation_id' => $conversation->id,
        'approvals' => [['id' => 'call_delete', 'approved' => false]],
    ]);

    $resume->assertOk();
    expect($resume->streamedContent())->toContain('data: [DONE]');
});

test('paused turn the user moved past no longer offers approval', function () {
    $user = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $conversationId = (string) Str::uuid7();

    $user->conversations()->create(['id' => $conversationId, 'title' => 'Moved on']);

    $base = [
        'conversation_id' => $conversationId,
        'participant_type' => $user->getMorphClass(),
        'participant_id' => $user->id,
        'agent' => AppAssistant::class,
        'attachments' => [],
        'usage' => [],
        'meta' => [],
    ];

    ConversationMessage::query()->create([
        ...$base,
        'id' => (string) Str::uuid7(),
        'role' => 'assistant',
        'content' => '',
        'steps' => [[
            'content' => '',
            'tool_calls' => [['id' => 'call_old', 'name' => 'ManageUsers', 'arguments' => ['action' => 'delete'], 'approval_reason' => 'ManageUsers delete deletes data.']],
            'reasoning' => '',
            'replay_blocks' => [],
            'provider_tool_calls' => [],
        ]],
        'status' => MessageStatus::Paused,
        'created_at' => now()->subMinute(),
    ]);
    ConversationMessage::query()->create([
        ...$base,
        'id' => (string) Str::uuid7(),
        'role' => 'user',
        'content' => 'Never mind',
        'steps' => [],
        'status' => MessageStatus::Completed,
    ]);

    $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->assertJsonPath('messages.0.pending_approvals', [])
        ->assertJsonPath('messages.0.content', 'Not run: ManageUsers was not approved.');

    $this->postJson(route('ai.chat'), [
        'conversation_id' => $conversationId,
        'approvals' => [['id' => 'call_old', 'approved' => true]],
    ])->assertUnprocessable();
});

test('approval resume is rejected for foreign conversations', function () {
    $owner = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $intruder = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $conversationId = (string) Str::uuid7();

    $owner->conversations()->create(['id' => $conversationId, 'title' => 'Private']);

    $this->actingAs($intruder)
        ->postJson(route('ai.chat'), [
            'conversation_id' => $conversationId,
            'approvals' => [['id' => 'call_1', 'approved' => true]],
        ])
        ->assertNotFound();
});
