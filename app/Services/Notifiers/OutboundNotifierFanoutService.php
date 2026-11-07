<?php

namespace App\Services\Notifiers;

use App\Jobs\DeliverSlackOutboundNotifierJob;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;

/**
 * Queues Slack / Telegram notifier jobs alongside the outbound webhook bus.
 */
class OutboundNotifierFanoutService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function dispatch(string $type, array $data = []): void
    {
        if (OutboundWebhookDispatcherService::suppressed()) {
            return;
        }

        if (! $this->projectSettings->canAllowNotifierEvent($type)) {
            return;
        }

        if ($this->projectSettings->notifierSlackWebhookUrl() !== null) {
            $message = OutboundNotifierMessageFormatterService::format(
                $type,
                $data,
                OutboundNotifierMessageFormatterService::CHANNEL_SLACK,
            );
            $pending = DeliverSlackOutboundNotifierJob::dispatch($type, $message);
            if (! app()->runningUnitTests()) {
                $pending->afterCommit();
            }
        }

        if ($this->projectSettings->isNotifierTelegramConfigured()) {
            $message = OutboundNotifierMessageFormatterService::format(
                $type,
                $data,
                OutboundNotifierMessageFormatterService::CHANNEL_TELEGRAM,
            );
            $pending = DeliverTelegramOutboundNotifierJob::dispatch($type, $message);
            if (! app()->runningUnitTests()) {
                $pending->afterCommit();
            }
        }
    }
}
