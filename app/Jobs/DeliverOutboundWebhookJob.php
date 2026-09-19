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
 * POSTs a signed outbound webhook event to the project webhook URL.
 */
class DeliverOutboundWebhookJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 15;

    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public readonly string $eventId,
        public readonly string $type,
        public readonly string $createdAt,
        public readonly array $data,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30, 60];
    }

    public function handle(ProjectSettings $projectSettings): void
    {
        $url = $projectSettings->webhookUrl();
        if ($url === null) {
            return;
        }

        $secret = $projectSettings->webhookSecret() ?? '';

        // Cast so empty data is `{}` (not `[]`) for consumers expecting an object.
        $payload = json_encode([
            'id' => $this->eventId,
            'type' => $this->type,
            'created_at' => $this->createdAt,
            'data' => (object) $this->data,
        ], JSON_THROW_ON_ERROR);

        $timestamp = (string) now()->timestamp;
        $signature = 'sha256='.hash_hmac('sha256', $payload, $secret);

        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->withHeaders([
                'X-Externa-Signature' => $signature,
                'X-Externa-Event-Id' => $this->eventId,
                'X-Externa-Timestamp' => $timestamp,
                'User-Agent' => 'Externa-Webhooks/1.0',
            ])
            ->withBody($payload, 'application/json')
            ->post($url);

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Outbound webhook delivery failed (%s): HTTP %s',
                $this->eventId,
                $response->status(),
            ));
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Outbound webhook delivery exhausted retries', [
            'event_id' => $this->eventId,
            'type' => $this->type,
            'message' => $exception?->getMessage(),
        ]);
    }
}
