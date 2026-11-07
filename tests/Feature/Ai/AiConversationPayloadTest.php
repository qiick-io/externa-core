<?php

use App\Ai\Agents\AppAssistant;
use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia;
use Laravel\Ai\Enums\MessageStatus;
use Laravel\Ai\Models\ConversationMessage;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * A finished turn with reasoning, three tool outcomes, usage, model and a citation.
 *
 * @return array{0: User, 1: string}
 */
function conversationWithRichTurn(): array
{
    $user = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $conversationId = (string) Str::uuid7();

    $user->conversations()->create(['id' => $conversationId, 'title' => 'Rich turn']);

    $base = [
        'conversation_id' => $conversationId,
        'participant_type' => $user->getMorphClass(),
        'participant_id' => $user->id,
        'agent' => AppAssistant::class,
        'attachments' => [],
    ];

    ConversationMessage::query()->create([
        ...$base,
        'id' => (string) Str::uuid7(),
        'role' => 'user',
        'content' => 'Tidy the journal',
        'steps' => [],
        'usage' => [],
        'meta' => [],
        'status' => MessageStatus::Completed,
        'created_at' => now()->subMinute(),
    ]);

    ConversationMessage::query()->create([
        ...$base,
        'id' => (string) Str::uuid7(),
        'role' => 'assistant',
        'content' => 'Done: two items updated.',
        'steps' => [
            [
                'content' => '',
                'reasoning' => 'First list the items, then update the stale ones.',
                'tool_calls' => [
                    ['id' => 'call_list', 'name' => 'ManageCollectionItems', 'arguments' => ['action' => 'list'], 'result' => '{"items":2}'],
                    ['id' => 'call_bad', 'name' => 'ManageFiles', 'arguments' => ['action' => 'move'], 'result' => 'Folder not found', 'failed' => true],
                    ['id' => 'call_no', 'name' => 'ManageUsers', 'arguments' => ['action' => 'delete'], 'result' => 'Denied by the user', 'denied' => true],
                ],
                'replay_blocks' => [],
                'provider_tool_calls' => [['id' => 'ws_1', 'type' => 'web_search_call', 'data' => ['query' => 'journal']]],
            ],
            [
                'content' => 'Done: two items updated.',
                'reasoning' => '',
                'tool_calls' => [],
                'replay_blocks' => [],
                'provider_tool_calls' => [],
            ],
        ],
        'usage' => ['input_tokens' => 120, 'output_tokens' => 40, 'reasoning_tokens' => 12, 'cache_read_input_tokens' => 0, 'cache_write_input_tokens' => 0],
        'meta' => ['provider' => 'openai', 'model' => 'gpt-5-mini', 'citations' => [['url' => 'https://example.test/doc', 'title' => 'Doc', 'start_index' => null, 'end_index' => null]]],
        'status' => MessageStatus::Completed,
    ]);

    return [$user, $conversationId];
}

test('conversation api returns the steps, tool outcomes, usage, model and citations of a turn', function () {
    [$user, $conversationId] = conversationWithRichTurn();

    $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->assertJsonPath('messages.1.steps.0.reasoning', 'First list the items, then update the stale ones.')
        ->assertJsonPath('messages.1.steps.0.tools.0', [
            'id' => 'call_list',
            'name' => 'ManageCollectionItems',
            'arguments' => ['action' => 'list'],
            'state' => 'output-available',
            'result' => '{"items":2}',
            'error' => null,
        ])
        ->assertJsonPath('messages.1.steps.0.tools.1.state', 'output-error')
        ->assertJsonPath('messages.1.steps.0.tools.1.error', 'Folder not found')
        ->assertJsonPath('messages.1.steps.0.tools.2.state', 'output-denied')
        ->assertJsonPath('messages.1.steps.0.provider_tools.0.type', 'web_search_call')
        ->assertJsonPath('messages.1.steps.1.content', 'Done: two items updated.')
        ->assertJsonPath('messages.1.usage.reasoning_tokens', 12)
        ->assertJsonPath('messages.1.model', 'gpt-5-mini')
        ->assertJsonPath('messages.1.citations', [['url' => 'https://example.test/doc', 'title' => 'Doc']])
        ->assertJsonPath('messages.0.steps', [])
        ->assertJsonPath('messages.0.usage', null);
});

test('assistant page props carry the same turn details for a reload', function () {
    [$user, $conversationId] = conversationWithRichTurn();

    $this->actingAs($user)
        ->get(route('ai.show', $conversationId))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('ai/index')
            ->where('messages.1.steps.0.tools.1.state', 'output-error')
            ->where('messages.1.usage.output_tokens', 40)
            ->where('messages.1.model', 'gpt-5-mini')
            ->where('messages.1.citations.0.url', 'https://example.test/doc'));
});

test('a tool call still awaiting approval is approval-requested only on the last turn', function () {
    $user = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $conversationId = (string) Str::uuid7();

    $user->conversations()->create(['id' => $conversationId, 'title' => 'Paused']);

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
            'reasoning' => '',
            'tool_calls' => [['id' => 'call_wait', 'name' => 'ManageUsers', 'arguments' => ['action' => 'delete'], 'approval_reason' => 'Deletes data.']],
            'replay_blocks' => [],
            'provider_tool_calls' => [],
        ]],
        'usage' => [],
        'meta' => [],
        'status' => MessageStatus::Paused,
    ]);

    $this->actingAs($user)
        ->getJson(route('ai.conversations.show', $conversationId))
        ->assertOk()
        ->assertJsonPath('messages.0.steps.0.tools.0.state', 'approval-requested');
});
