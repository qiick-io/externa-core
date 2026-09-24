<?php

namespace App\Services\Webhooks;

use App\Services\Settings\SettingsRepository;
use Illuminate\Support\Str;

/**
 * Last delivery outcomes for the project webhook (settings-backed, admin visibility only).
 *
 * The recent list is a best-effort ring buffer: concurrent workers may drop an entry.
 */
class OutboundWebhookDeliveryLog
{
    public const GROUP = 'webhooks';

    public const RECENT_LIMIT = 10;

    private const MESSAGE_MAX_LENGTH = 500;

    public function __construct(
        private readonly SettingsRepository $settings,
    ) {}

    public function recordSuccess(string $eventId, string $type, int $status, int $attempts): void
    {
        $entry = [
            'event_id' => $eventId,
            'type' => $type,
            'outcome' => 'success',
            'status' => $status,
            'message' => null,
            'attempts' => $attempts,
            'at' => $this->now(),
        ];

        $this->settings->set(SettingsRepository::SCOPE_PROJECT, self::GROUP, 'last_success', $entry);
        $this->pushRecent($entry);
    }

    public function recordFailure(string $eventId, string $type, ?string $message, int $attempts): void
    {
        $entry = [
            'event_id' => $eventId,
            'type' => $type,
            'outcome' => 'failed',
            'status' => null,
            'message' => Str::limit($message ?? 'Unknown error', self::MESSAGE_MAX_LENGTH),
            'attempts' => $attempts,
            'at' => $this->now(),
        ];

        $this->settings->set(SettingsRepository::SCOPE_PROJECT, self::GROUP, 'last_error', $entry);
        $this->pushRecent($entry);
    }

    /**
     * @return array{
     *     last_success: array<string, mixed>|null,
     *     last_error: array<string, mixed>|null,
     *     recent: list<array<string, mixed>>
     * }
     */
    public function summary(): array
    {
        $stored = $this->settings->project(self::GROUP);

        $recent = is_array($stored['recent'] ?? null) ? array_values($stored['recent']) : [];

        return [
            'last_success' => is_array($stored['last_success'] ?? null) ? $stored['last_success'] : null,
            'last_error' => is_array($stored['last_error'] ?? null) ? $stored['last_error'] : null,
            'recent' => array_values(array_filter($recent, 'is_array')),
        ];
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function pushRecent(array $entry): void
    {
        $recent = $this->summary()['recent'];
        array_unshift($recent, $entry);

        $this->settings->set(
            SettingsRepository::SCOPE_PROJECT,
            self::GROUP,
            'recent',
            array_slice($recent, 0, self::RECENT_LIMIT),
        );
    }

    private function now(): string
    {
        return now()->utc()->format('Y-m-d\TH:i:s\Z');
    }
}
