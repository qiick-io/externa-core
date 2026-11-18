<?php

declare(strict_types=1);

use App\Ai\Agents\AppAssistant;
use App\Ai\Agents\ContentTranslator;
use App\Ai\Support\AiActivityLogger;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Ai\AiDailyBudgetService;
use Carbon\CarbonInterface;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
});

/**
 * Store an assistant turn with the given token usage for the user, as laravel/ai does.
 */
function storeAssistantUsage(User $user, int $inputTokens, int $outputTokens, ?CarbonInterface $createdAt = null): void
{
    $createdAt ??= now();

    DB::table('agent_conversation_messages')->insert([
        'id' => (string) Str::uuid7(),
        'conversation_id' => (string) Str::uuid7(),
        'participant_type' => $user->getMorphClass(),
        'participant_id' => $user->id,
        'agent' => AppAssistant::class,
        'role' => 'assistant',
        'content' => 'Answer',
        'attachments' => '[]',
        'steps' => '[]',
        'usage' => json_encode(['input_tokens' => $inputTokens, 'output_tokens' => $outputTokens]),
        'meta' => '[]',
        'status' => 'completed',
        'created_at' => $createdAt,
        'updated_at' => $createdAt,
    ]);
}

/**
 * @return array{source_locale: string, target_locale: string, fields: array<string, string>}
 */
function translatePayload(): array
{
    return ['source_locale' => 'it', 'target_locale' => 'en', 'fields' => ['title' => 'Ciao']];
}

test('daily limits are off by default', function () {
    expect(config('ai.daily_prompt_limit'))->toBe(0)
        ->and(config('ai.daily_token_budget'))->toBe(0)
        ->and(config('ai.rate_limit.per_day'))->toBe(0);

    AiActivityLogger::prompt($this->user, 'Earlier prompt');
    storeAssistantUsage($this->user, 900000, 900000);
    ContentTranslator::fake([json_encode(['fields' => ['title' => 'Hello']], JSON_THROW_ON_ERROR)]);

    $this->actingAs($this->user)
        ->postJson(route('ai.translate-fields'), translatePayload())
        ->assertOk();
});

test('chat answers 429 when the daily token budget is used up, before calling the provider', function () {
    config()->set('ai.daily_token_budget', 1000);
    storeAssistantUsage($this->user, 600, 400);
    AppAssistant::fake(['Should not run']);

    $this->actingAs($this->user)
        ->postJson(route('ai.chat'), ['message' => 'One more'])
        ->assertTooManyRequests()
        ->assertJsonPath('message', 'Daily AI token budget reached.');

    AppAssistant::assertNeverPrompted();
});

test('token budget counts only today and only the user own turns', function () {
    config()->set('ai.daily_token_budget', 1000);
    storeAssistantUsage($this->user, 5000, 5000, now()->subDay()->endOfDay());
    storeAssistantUsage(User::factory()->create(), 5000, 5000);
    storeAssistantUsage($this->user, 100, 50);

    expect(app(AiDailyBudgetService::class)->tokensUsedToday($this->user))->toBe(150)
        ->and(app(AiDailyBudgetService::class)->exhaustedMessage($this->user))->toBeNull();
});

test('the token budget message is translated', function () {
    config()->set('ai.daily_token_budget', 10);
    storeAssistantUsage($this->user, 10, 0);
    app()->setLocale('it');

    expect(app(AiDailyBudgetService::class)->exhaustedMessage($this->user))
        ->toBe('Budget giornaliero di token AI esaurito.');
});

test('translate fields answers 429 when the daily prompt cap is reached', function () {
    config()->set('ai.daily_prompt_limit', 1);
    AiActivityLogger::prompt($this->user, 'Chat prompt');
    ContentTranslator::fake(['{}']);

    $this->actingAs($this->user)
        ->postJson(route('ai.translate-fields'), translatePayload())
        ->assertTooManyRequests()
        ->assertJsonPath('message', 'Daily AI prompt limit reached.');

    ContentTranslator::assertNeverPrompted();
});

test('translate fields answers 429 when the daily token budget is used up', function () {
    config()->set('ai.daily_token_budget', 500);
    storeAssistantUsage($this->user, 500, 0);
    ContentTranslator::fake(['{}']);

    $this->actingAs($this->user)
        ->postJson(route('ai.translate-fields'), translatePayload())
        ->assertTooManyRequests()
        ->assertJsonPath('message', 'Daily AI token budget reached.');

    ContentTranslator::assertNeverPrompted();
});

test('a translation is logged as an ai prompt without field content and counts towards the cap', function () {
    config()->set('ai.daily_prompt_limit', 1);
    ContentTranslator::fake([json_encode(['fields' => ['title' => 'Hello']], JSON_THROW_ON_ERROR)]);

    $this->actingAs($this->user)
        ->postJson(route('ai.translate-fields'), translatePayload())
        ->assertOk();

    $activity = Activity::query()->where('event', 'ai_prompt')->sole();

    expect($activity->causer_id)->toBe($this->user->id)
        ->and($activity->properties->get('surface'))->toBe('translate')
        ->and($activity->properties->get('prompt'))->toBe('Translate fields it → en: title')
        ->and($activity->properties->get('usage'))->toBeArray();

    $this->postJson(route('ai.chat'), ['message' => 'Hi'])
        ->assertTooManyRequests();
});

test('translation token usage counts towards the token budget', function () {
    AiActivityLogger::prompt($this->user, 'Translate fields it → en: title', extra: [
        'surface' => AiDailyBudgetService::SURFACE_TRANSLATE,
        'usage' => ['input_tokens' => 70, 'output_tokens' => 30],
    ]);
    storeAssistantUsage($this->user, 10, 5);

    expect(app(AiDailyBudgetService::class)->tokensUsedToday($this->user))->toBe(115);
});

test('ai status shows today usage only when a daily limit is set', function () {
    Http::fake(['http://127.0.0.1:1234/v1/models' => Http::response(null, 500)]);
    $this->actingAs($this->user);

    $this->getJson(route('ai.status'))
        ->assertOk()
        ->assertJsonPath('daily_usage', null);

    config()->set('ai.daily_prompt_limit', 50);
    config()->set('ai.daily_token_budget', 10000);
    AiActivityLogger::prompt($this->user, 'Prompt');
    storeAssistantUsage($this->user, 1200, 300);

    $this->getJson(route('ai.status'))
        ->assertOk()
        ->assertJsonPath('daily_usage', [
            'prompts_used' => 1,
            'prompt_limit' => 50,
            'tokens_used' => 1500,
            'token_budget' => 10000,
        ]);

    config()->set('ai.daily_prompt_limit', 0);

    $this->getJson(route('ai.status'))
        ->assertOk()
        ->assertJsonPath('daily_usage.prompt_limit', null)
        ->assertJsonPath('daily_usage.token_budget', 10000);
});

test('the ai chat limiter keeps 30 requests per minute per user by default', function () {
    $this->actingAs($this->user);

    for ($attempt = 1; $attempt <= 30; $attempt++) {
        $this->postJson(route('ai.chat'), ['message' => ''])->assertUnprocessable();
    }

    $this->postJson(route('ai.chat'), ['message' => ''])->assertTooManyRequests();

    $this->actingAs(grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]))
        ->postJson(route('ai.chat'), ['message' => ''])
        ->assertUnprocessable();
});

test('the ai chat limiter enforces the per-day limit when set', function () {
    config()->set('ai.rate_limit.per_minute', 100);
    config()->set('ai.rate_limit.per_day', 2);
    $this->actingAs($this->user);

    $this->postJson(route('ai.chat'), ['message' => ''])->assertUnprocessable();
    $this->postJson(route('ai.chat'), ['message' => ''])->assertUnprocessable();
    $this->postJson(route('ai.chat'), ['message' => ''])->assertTooManyRequests();
});
