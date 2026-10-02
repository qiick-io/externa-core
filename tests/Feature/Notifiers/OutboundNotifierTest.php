<?php

use App\Jobs\DeliverSlackOutboundNotifierJob;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
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
        return $job->type === 'ping' && str_contains($job->message, 'ping');
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

test('telegram job posts sendMessage', function () {
    configureTelegramNotifier('123456:ABC', '99');
    Http::fake([
        'api.telegram.org/*' => Http::response(['ok' => true], 200),
    ]);

    $job = new DeliverTelegramOutboundNotifierJob('item.created', 'hello');
    $job->handle(app(ProjectSettings::class));

    Http::assertSent(function ($request): bool {
        return str_contains($request->url(), 'bot123456:ABC/sendMessage')
            && $request['chat_id'] === '99'
            && $request['text'] === 'hello';
    });
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
