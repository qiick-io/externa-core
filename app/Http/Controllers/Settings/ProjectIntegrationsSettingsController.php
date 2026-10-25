<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Settings\UpdateProjectIntegrationsSettingsRequest;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Services\Notifiers\OutboundNotifierMessageFormatter;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Webhooks\OutboundWebhookCatalog;
use App\Services\Webhooks\OutboundWebhookDeliveryLog;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Integrations project settings (outbound webhooks + Slack/Telegram notifiers).
 */
class ProjectIntegrationsSettingsController extends Controller
{
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Render the integrations settings form.
     */
    public function edit(OutboundWebhookDeliveryLog $deliveryLog): Response
    {
        return Inertia::render('settings/project/integrations', [
            'project' => $this->projectSettings->forEditOnly([
                'webhook_url',
                'webhook_secret_configured',
                'notifier_slack_webhook_url',
                'notifier_telegram_bot_token_configured',
                'notifier_telegram_chat_id',
                'notifier_event_types',
            ]),
            'webhookEvents' => OutboundWebhookCatalog::all(),
            'webhookDeliveries' => $deliveryLog->summary(),
        ]);
    }

    /**
     * Persist integrations settings.
     */
    public function update(UpdateProjectIntegrationsSettingsRequest $request): RedirectResponse
    {
        $values = $request->projectValues();

        $this->settings->setMany(
            SettingsRepository::SCOPE_PROJECT,
            'project',
            $values,
        );

        $this->logProjectSettingsUpdate(
            $request,
            'integrations',
            $values,
            ['webhook_secret', 'notifier_telegram_bot_token'],
        );

        return to_route('project.integrations.edit');
    }

    /**
     * Queue a signed `ping` webhook event to the configured URL.
     */
    public function sendTestWebhook(OutboundWebhookDispatcher $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->webhookUrl() === null) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a webhook URL before sending a test event.'));
        }

        if ($this->projectSettings->webhookSecret() === null) {
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
    public function sendTestSlackNotifier(OutboundWebhookDispatcher $dispatcher): RedirectResponse
    {
        if ($this->projectSettings->notifierSlackWebhookUrl() === null) {
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
        if (! $this->projectSettings->notifierTelegramConfigured()) {
            return to_route('project.integrations.edit')
                ->with('error', __('Configure a Telegram bot token and chat ID before sending a test message.'));
        }

        $message = OutboundNotifierMessageFormatter::format(
            'ping',
            [],
            OutboundNotifierMessageFormatter::CHANNEL_TELEGRAM,
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
