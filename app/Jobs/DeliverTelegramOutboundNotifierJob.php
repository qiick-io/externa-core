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
 * POST sendMessage to the Telegram Bot API for a configured chat.
 */
class DeliverTelegramOutboundNotifierJob implements ShouldQueue
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
        $token = $projectSettings->notifierTelegramBotToken();
        $chatId = $projectSettings->notifierTelegramChatId();
        if ($token === null || $chatId === null) {
            return;
        }

        $endpoint = 'https://api.telegram.org/bot'.$token.'/sendMessage';

        $response = Http::timeout(5)
            ->connectTimeout(3)
            ->withHeaders(['User-Agent' => 'Externa-Notifiers/1.0'])
            ->post($endpoint, [
                'chat_id' => $chatId,
                'text' => $this->message,
                'disable_web_page_preview' => true,
            ]);

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Telegram notifier delivery failed (%s): HTTP %s',
                $this->type,
                $response->status(),
            ));
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Telegram notifier delivery exhausted retries', [
            'type' => $this->type,
            'message' => $exception?->getMessage(),
        ]);
    }
}
