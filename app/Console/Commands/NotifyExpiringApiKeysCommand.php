<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\ApiKey;
use App\Models\User;
use App\Notifications\ApiKeyExpiringNotification;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

#[Signature('api-keys:notify-expiring')]
#[Description('Notify owners and issuers of API keys that expire in the coming days')]
/**
 * Daily: notify the owner of every active key that expires between `api.key_expiry_notice_days`
 * and one day later (7 to 8 days by default), and the issuer too when that is someone else.
 * Running once a day over a one-day window notifies each key once without storing anything.
 *
 * Side effect: queues one {@see ApiKeyExpiringNotification} (bell and mail) per recipient.
 */
class NotifyExpiringApiKeysCommand extends Command
{
    public function handle(): int
    {
        $noticeDays = max(1, (int) config('api.key_expiry_notice_days', 7));
        $windowStart = now()->addDays($noticeDays);

        $expiringApiKeys = ApiKey::query()
            ->with(['owner', 'creator'])
            ->whereNull('revoked_at')
            ->where('expires_at', '>=', $windowStart)
            ->where('expires_at', '<', $windowStart->copy()->addDay())
            ->get();

        foreach ($expiringApiKeys as $expiringApiKey) {
            foreach ($this->recipients($expiringApiKey) as $recipient) {
                $recipient->notify(new ApiKeyExpiringNotification($expiringApiKey));
            }
        }

        $this->info(sprintf('Notified about %d expiring API key(s).', $expiringApiKeys->count()));

        return self::SUCCESS;
    }

    /**
     * The owner and the issuer, once each, skipping anyone deactivated or deleted.
     *
     * @return Collection<int, User>
     */
    private function recipients(ApiKey $apiKey): Collection
    {
        return collect([$apiKey->owner, $apiKey->creator])
            ->filter(static fn (?User $user): bool => $user instanceof User && $user->is_active && ! $user->trashed())
            ->unique('id')
            ->values();
    }
}
