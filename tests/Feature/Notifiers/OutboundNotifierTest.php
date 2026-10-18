<?php

use App\Enums\FieldTypeEnum;
use App\Jobs\DeliverSlackOutboundNotifierJob;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemValue;
use App\Models\User;
use App\Services\Notifiers\OutboundNotifierMessageFormatter;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->withoutVite();
});

function configureSlackNotifier(string $url = 'https://hooks.slack.com/services/T/B/x'): void
{
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'notifier_slack_webhook_url',
        $url,
    );
}

function configureTelegramNotifier(
    string $token = '123456:ABC',
    string $chatId = '-100123',
): void {
    $repository = app(SettingsRepository::class);
    $repository->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'notifier_telegram_bot_token',
        ProjectSettings::encryptNotifierTelegramBotToken($token),
    );
    $repository->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'notifier_telegram_chat_id',
        $chatId,
    );
}

test('dispatcher queues slack notifier without webhook url', function () {
    Queue::fake();
    configureSlackNotifier();

    app(OutboundWebhookDispatcher::class)->dispatch('item.updated', [
        'collection_slug' => 'posts',
        'item_id' => 7,
    ]);

    Queue::assertPushed(DeliverSlackOutboundNotifierJob::class, function (DeliverSlackOutboundNotifierJob $job): bool {
        return $job->type === 'item.updated'
            && str_contains($job->message, 'Item updated')
            && str_contains($job->message, 'posts')
            && str_contains($job->message, '7');
    });
    Queue::assertNotPushed(DeliverTelegramOutboundNotifierJob::class);
});

test('dispatcher queues telegram notifier when token and chat configured', function () {
    Queue::fake();
    configureTelegramNotifier();

    app(OutboundWebhookDispatcher::class)->dispatch('ping', []);

    Queue::assertPushed(DeliverTelegramOutboundNotifierJob::class, function (DeliverTelegramOutboundNotifierJob $job): bool {
        return $job->type === 'ping'
            && str_contains($job->message, 'Test ping')
            && str_contains($job->message, '<b>');
    });
});

test('slack job posts text payload', function () {
    configureSlackNotifier('https://hooks.slack.com/services/T/B/x');
    Http::fake([
        'hooks.slack.com/*' => Http::response('ok', 200),
    ]);

    $job = new DeliverSlackOutboundNotifierJob('ping', 'Externa test');
    $job->handle(app(ProjectSettings::class));

    Http::assertSent(function ($request): bool {
        return $request->url() === 'https://hooks.slack.com/services/T/B/x'
            && $request['text'] === 'Externa test';
    });
});

test('telegram job posts sendMessage with HTML parse_mode', function () {
    configureTelegramNotifier('123456:ABC', '99');
    Http::fake([
        'api.telegram.org/*' => Http::response(['ok' => true], 200),
    ]);

    $job = new DeliverTelegramOutboundNotifierJob('item.created', '<b>Item created</b>');
    $job->handle(app(ProjectSettings::class));

    Http::assertSent(function ($request): bool {
        return str_contains($request->url(), 'bot123456:ABC/sendMessage')
            && $request['chat_id'] === '99'
            && $request['text'] === '<b>Item created</b>'
            && $request['parse_mode'] === 'HTML';
    });
});

test('formatter uses HTML for telegram and mrkdwn for slack', function () {
    $data = [
        'event_title' => 'Item updated',
        'collection_slug' => 'qa_slug',
        'collection_name' => 'QA Collection',
        'collection_id' => 17,
        'item_id' => 604,
        'item_title' => 'Hello world',
        'approval_status' => 'draft',
        'actor_name' => 'Luca',
        'actor_email' => 'luca@example.com',
        'occurred_at' => '18 Oct 2026, 14:48',
        'admin_url' => 'https://example.test/collections/17/items/604',
    ];

    $slack = OutboundNotifierMessageFormatter::format('item.updated', $data);
    expect($slack)->toContain('*Item updated*')
        ->and($slack)->toContain('Hello world')
        ->and($slack)->toContain('QA Collection')
        ->and($slack)->toContain('`qa_slug`')
        ->and($slack)->toContain('Status: draft')
        ->and($slack)->toContain('By: Luca (luca@example.com)')
        ->and($slack)->toContain('<https://example.test/collections/17/items/604|Open in Externa>')
        ->and($slack)->not->toContain('<b>');

    $telegram = OutboundNotifierMessageFormatter::format(
        'item.updated',
        $data,
        OutboundNotifierMessageFormatter::CHANNEL_TELEGRAM,
    );
    expect($telegram)->toContain('<b>Item updated</b>')
        ->and($telegram)->toContain('<b>Hello world</b>')
        ->and($telegram)->toContain('<code>qa_slug</code>')
        ->and($telegram)->toContain('<a href="https://example.test/collections/17/items/604">Open in Externa</a>')
        ->and($telegram)->not->toContain('*Item updated*');
});

test('telegram formatter escapes HTML in dynamic values', function () {
    $telegram = OutboundNotifierMessageFormatter::format(
        'item.updated',
        [
            'event_title' => 'Item updated',
            'collection_slug' => 'a<b>&c',
        ],
        OutboundNotifierMessageFormatter::CHANNEL_TELEGRAM,
    );

    expect($telegram)->toContain('<code>a&lt;b&gt;&amp;c</code>');
});

test('context builder enriches item title actor status and admin url', function () {
    $user = User::factory()->create([
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Articles',
        'slug' => 'articles',
    ]);
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'approval_status' => 'in_review',
        'user_updated_id' => $user->id,
    ]);
    CollectionItemValue::query()->create([
        'item_id' => $item->id,
        'field_id' => $field->id,
        'locale' => null,
        'position' => 0,
        'value' => 'Shipping manifesto',
    ]);

    Queue::fake();
    configureTelegramNotifier();

    app(OutboundWebhookDispatcher::class)->dispatchItem('item.updated', $item, $collection);

    Queue::assertPushed(DeliverTelegramOutboundNotifierJob::class, function (DeliverTelegramOutboundNotifierJob $job) use ($item, $collection): bool {
        return str_contains($job->message, '<b>Item updated</b>')
            && str_contains($job->message, 'Shipping manifesto')
            && str_contains($job->message, 'Articles')
            && str_contains($job->message, '<code>articles</code>')
            && str_contains($job->message, 'Status: in review')
            && str_contains($job->message, 'Ada Lovelace')
            && str_contains($job->message, 'ada@example.com')
            && str_contains($job->message, 'Open in Externa')
            && str_contains($job->message, (string) $item->id)
            && str_contains($job->message, (string) $collection->id);
    });
});

test('telegram job exception includes bot api description', function () {
    configureTelegramNotifier('123456:ABC', '99');
    Http::fake([
        'api.telegram.org/*' => Http::response([
            'ok' => false,
            'error_code' => 404,
            'description' => 'Not Found',
        ], 404),
    ]);

    $job = new DeliverTelegramOutboundNotifierJob('ping', 'test');

    expect(fn () => $job->handle(app(ProjectSettings::class)))
        ->toThrow(RuntimeException::class, 'HTTP 404 — Not Found');
});

test('notifiers respect withoutWebhooks suppression', function () {
    Queue::fake();
    configureSlackNotifier();
    configureTelegramNotifier();

    OutboundWebhookDispatcher::withoutWebhooks(function (): void {
        app(OutboundWebhookDispatcher::class)->dispatch('ping', []);
    });

    Queue::assertNothingPushed();
});

test('notifier event type filter skips disabled domain events but allows ping', function () {
    Queue::fake();
    configureTelegramNotifier();

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'notifier_event_types',
        ['item.published'],
    );

    app(OutboundWebhookDispatcher::class)->dispatch('item.updated', [
        'collection_slug' => 'posts',
        'item_id' => 1,
    ]);
    Queue::assertNotPushed(DeliverTelegramOutboundNotifierJob::class);

    app(OutboundWebhookDispatcher::class)->dispatch('item.published', [
        'collection_slug' => 'posts',
        'item_id' => 1,
    ]);
    Queue::assertPushed(DeliverTelegramOutboundNotifierJob::class, 1);

    app(OutboundWebhookDispatcher::class)->dispatch('ping', []);
    Queue::assertPushed(DeliverTelegramOutboundNotifierJob::class, 2);
});
