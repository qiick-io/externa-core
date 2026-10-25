<?php

namespace App\Jobs;

use App\Services\Settings\ProjectSettings;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * POST a short text payload to a Slack incoming webhook URL.
 */
class DeliverSlackOutboundNotifierJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 10;

    public function __construct(
        public readonly string $type,
        public readonly string $message,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [15, 45];
    }

    public function handle(ProjectSettings $projectSettings): void
    {
        $url = $projectSettings->notifierSlackWebhookUrl();
        if ($url === null) {
            return;
        }

        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->withHeaders(['User-Agent' => 'Externa-Notifiers/1.0'])
            ->post($url, ['text' => $this->message]);

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Slack notifier delivery failed (%s): HTTP %s',
                $this->type,
                $response->status(),
            ));
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Slack notifier delivery exhausted retries', [
            'type' => $this->type,
            'message' => $exception?->getMessage(),
        ]);
    }
}
