<?php

declare(strict_types=1);

namespace App\Actions\ApiKeys;

use App\Models\ApiKey;

/**
 * Stamps when and from where an API key was last used, at most once a minute per key, so a busy
 * integration does not write on every request. A new address is written straight away, so a key
 * used from somewhere new shows it even inside that minute.
 *
 * Writes quietly: usage is not an activity-log event, and `updated_at` stays the time the key
 * itself last changed.
 */
final class RecordApiKeyUsageAction
{
    private const int WRITE_INTERVAL_SECONDS = 60;

    public function execute(ApiKey $apiKey, ?string $clientIp): void
    {
        $lastUsedAt = $apiKey->last_used_at;
        $isRecent = $lastUsedAt !== null && $lastUsedAt->diffInSeconds(now()) < self::WRITE_INTERVAL_SECONDS;

        if ($isRecent && $apiKey->last_used_ip === $clientIp) {
            return;
        }

        $apiKey->timestamps = false;
        $apiKey->forceFill(['last_used_at' => now(), 'last_used_ip' => $clientIp])->saveQuietly();
        $apiKey->timestamps = true;
    }
}
