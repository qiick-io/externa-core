<?php

declare(strict_types=1);

namespace App\Actions\ApiKeys;

use App\Models\ApiKey;
use App\Models\User;

/**
 * Revoke a key immediately, keeping the row for the list and the audit trail. A revoked key has
 * no grace window, so the secret replaced by an earlier rotation stops working too. Key lookups
 * are not cached anywhere, so the next request with either secret is refused.
 *
 * Revoking an already revoked key changes nothing and logs nothing: the first `revoked_at` stays.
 *
 * Side effect: writes a `revoked` entry to the `api-keys` activity log.
 */
final class RevokeApiKeyAction
{
    public function execute(ApiKey $apiKey, User $actor): void
    {
        if ($apiKey->isRevoked()) {
            return;
        }

        $apiKey->forceFill([
            'revoked_at' => now(),
            'previous_key_hash' => null,
            'previous_key_valid_until' => null,
        ])->save();

        activity('api-keys')
            ->causedBy($actor)
            ->performedOn($apiKey)
            ->event('revoked')
            ->withProperties([
                'name' => $apiKey->name,
                'key_prefix' => $apiKey->key_prefix,
                'scopes' => $apiKey->scopes,
            ])
            ->log('API key revoked');
    }
}
