<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Http;

/**
 * A streamed answer renders as AI Elements parts on Trace: the reasoning closed
 * with its duration once the stream ends, each tool call as a sentence with its
 * state, several calls folded into "Done in N steps", the cited sources and the
 * text. The SSE body is replayed in the
 * page (laravel/ai event shapes), so no model is needed.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    Http::fake([
        '*/v1/models' => Http::response(['data' => [['id' => 'local-model']]], 200),
    ]);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

/**
 * Replace the page's fetch of /ai/chat with a stream of the given events.
 */
function replayAiChatStream(array $events): string
{
    $body = json_encode(implode('', array_map(
        fn (array|string $event): string => 'data: '.(is_string($event) ? $event : json_encode($event))."\n\n",
        $events,
    )));

    return <<<JS
(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/ai/chat')) {
      return Promise.resolve(new Response(new TextEncoder().encode({$body}), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    }
    return realFetch(input, init);
  };
})()
JS;
}

it('renders reasoning, tool steps, sources and text of a streamed answer', function (): void {
    $page = visit('/dashboard');

    $page->script(replayAiChatStream([
        ['type' => 'stream_start', 'provider' => 'local', 'model' => 'local-model'],
        ['type' => 'reasoning_delta', 'reasoning_id' => 'r1', 'delta' => 'Check the folder first.'],
        ['type' => 'reasoning_end', 'reasoning_id' => 'r1'],
        ['type' => 'tool_call', 'tool_id' => 'call_1', 'tool_name' => 'ManageFiles', 'arguments' => ['action' => 'list']],
        ['type' => 'tool_result', 'tool_id' => 'call_1', 'tool_name' => 'ManageFiles', 'result' => '{"files":2}', 'successful' => true, 'error' => null, 'denied' => false],
        ['type' => 'tool_call', 'tool_id' => 'call_2', 'tool_name' => 'ManageFiles', 'arguments' => ['action' => 'move']],
        ['type' => 'tool_result', 'tool_id' => 'call_2', 'tool_name' => 'ManageFiles', 'result' => 'Folder not found', 'successful' => false, 'error' => 'Folder not found', 'denied' => false],
        ['type' => 'citation', 'citation' => ['url' => 'https://example.test/guide', 'title' => 'Guide']],
        ['type' => 'text_delta', 'delta' => 'The move failed: the folder does not exist.'],
        ['type' => 'stream_end', 'reason' => 'stop', 'usage' => ['input_tokens' => 120, 'output_tokens' => 30]],
        '[DONE]',
    ]));

    $page->script("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))");

    $page->assertPresent('[role="dialog"] textarea:not([disabled])')
        ->type('[role="dialog"] textarea', 'Move the report')
        ->keys('[role="dialog"] textarea', 'Enter')
        ->assertSee('The move failed: the folder does not exist.')
        ->assertSee('Thought for 1 second')
        ->assertDontSee('Check the folder first.')
        ->assertSee('Done in 2 steps')
        ->assertSee('Used 1 source')
        ->assertScript(<<<'JS'
(() => {
  const answer = [...document.querySelectorAll('[role="dialog"] [data-slot="message-scroller-item"]')].at(-1);
  const reasoning = [...answer.querySelectorAll('button')].find((button) => button.textContent.includes('Thought for'));

  return reasoning.getAttribute('aria-expanded') === 'false';
})()
JS)
        ->assertNoJavaScriptErrors();
});
