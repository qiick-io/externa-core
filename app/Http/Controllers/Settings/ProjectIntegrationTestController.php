<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Services\Notifiers\OutboundNotifierMessageFormatterService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;
use Illuminate\Http\RedirectResponse;
use Throwable;

/**
 * Integrations project settings: send a test event to the configured webhook, Slack, or Telegram.
 */
class ProjectIntegrationTestController extends Controller
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * Queue a signed `ping` webhook event to the configured URL.
     */
    public function sendTestWebhook(OutboundWebhookDispatcherService $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->integrations()->webhookUrl() === null) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a webhook URL before sending a test event.'));
        }

        if ($this->projectSettings->integrations()->webhookSecret() === null) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a webhook signing secret before sending a test event.'));
        }

        $dispatcher->dispatchPing();

        return to_route('project.integrations.edit')
            ->with('success', __('Test webhook event queued.'));
    }

    /**
     * Queue a `ping` notifier message to Slack when configured.
     */
    public function sendTestSlackNotifier(OutboundWebhookDispatcherService $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->integrations()->notifierSlackWebhookUrl() === null) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a Slack incoming webhook URL before sending a test message.'));
        }

        $dispatcher->dispatchPing();

        return to_route('project.integrations.edit')
            ->with('success', __('Test Slack notifier queued.'));
    }

    /**
     * Send a `ping` notifier message to Telegram immediately when configured.
     *
     * Runs synchronously so settings UI can surface Bot API errors without a queue worker.
     */
    public function sendTestTelegramNotifier(): RedirectResponse
    {
        if (! $this->projectSettings->integrations()->isNotifierTelegramConfigured()) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a Telegram bot token and chat ID before sending a test message.'));
        }

        $message = OutboundNotifierMessageFormatterService::format(
            'ping',
            [],
            OutboundNotifierMessageFormatterService::CHANNEL_TELEGRAM,
        );

        try {
            (new DeliverTelegramOutboundNotifierJob('ping', $message))
                ->handle($this->projectSettings);
        } catch (Throwable $exception) {
            return to_route('project.integrations.edit')
                ->with('error', __('Telegram test failed: :error', [
                    'error' => $exception->getMessage(),
                ]));
        }

        return to_route('project.integrations.edit')
            ->with('success', __('Test Telegram message sent.'));
    }
}
