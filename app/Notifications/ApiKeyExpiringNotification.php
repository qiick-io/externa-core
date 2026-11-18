<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\ApiKey;
use App\Notifications\Concerns\BroadcastsWithDatabaseTrait;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells a key's owner (and its issuer, when someone else) that the key expires soon, in the bell
 * and by mail, so the integration can be given a new key before it stops. Sent once per key by
 * `api-keys:notify-expiring`. Carries the key's name and public prefix, never a secret.
 */
class ApiKeyExpiringNotification extends Notification implements ShouldQueue
{
    use BroadcastsWithDatabaseTrait {
        via as databaseAndBroadcastChannels;
    }
    use Queueable;

    public function __construct(
        public readonly ApiKey $apiKey,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return [...$this->databaseAndBroadcastChannels($notifiable), 'mail'];
    }

    /**
     * @return array{type: string, title: string, body: string, api_key_id: int, key_name: string, key_prefix: string, expires_at: string|null, url: string}
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'api_key_expiring',
            'title' => __('API key expires soon'),
            'body' => $this->body(),
            'api_key_id' => $this->apiKey->id,
            'key_name' => $this->apiKey->name,
            'key_prefix' => $this->apiKey->key_prefix,
            'expires_at' => $this->apiKey->expires_at?->toIso8601String(),
            'url' => route('api-keys.index', absolute: false),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('API key expires soon'))
            ->line($this->body())
            ->line(__('Create a new key and switch the integration to it before then.'))
            ->action(__('Open API keys'), route('api-keys.index'));
    }

    private function body(): string
    {
        return __('The API key ":name" (:prefix) expires on :date.', [
            'name' => $this->apiKey->name,
            'prefix' => $this->apiKey->key_prefix,
            'date' => $this->apiKey->expires_at?->toDayDateTimeString() ?? '',
        ]);
    }
}
