<?php

namespace App\Services\Notifiers;

use App\Jobs\DeliverSlackOutboundNotifierJob;
use App\Jobs\DeliverTelegramOutboundNotifierJob;
use App\Services\Settings\ProjectSettings;
use App\Services\Webhooks\OutboundWebhookDispatcher;

/**
 * Queues Slack / Telegram notifier jobs alongside the outbound webhook bus.
 */
class OutboundNotifierFanout
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function dispatch(string $type, array $data = []): void
    {
        if (OutboundWebhookDispatcher::suppressed()) {
            return;
        }

        $message = OutboundNotifierMessageFormatter::format($type, $data);

        if ($this->projectSettings->notifierSlackWebhookUrl() !== null) {
            $pending = DeliverSlackOutboundNotifierJob::dispatch($type, $message);
            if (! app()->runningUnitTests()) {
                $pending->afterCommit();
            }
        }

        if ($this->projectSettings->notifierTelegramConfigured()) {
            $pending = DeliverTelegramOutboundNotifierJob::dispatch($type, $message);
            if (! app()->runningUnitTests()) {
                $pending->afterCommit();
            }
        }
    }
}
