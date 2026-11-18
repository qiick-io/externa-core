<?php

declare(strict_types=1);

namespace App\Actions\ApiKeys;

use App\Data\Api\IssuedApiKeyData;
use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Issue a new secret for an existing key: same row, `uuid`, `key_prefix`, scopes and audit
 * trail. The replaced secret moves to `previous_key_hash` and keeps working until
 * `previous_key_valid_until` (`api.key_rotation_grace_hours`, 24 by default), so an integration
 * can switch without downtime. Rotating again inside the window replaces that previous secret:
 * only the secret issued last before the rotation keeps a grace window.
 *
 * Side effect: writes a `rotated` entry to the `api-keys` activity log.
 */
final class RotateApiKeyAction
{
    public function execute(ApiKey $apiKey, User $actor): IssuedApiKeyData
    {
        $graceHours = max(0, (int) config('api.key_rotation_grace_hours', 24));

        $issuedApiKey = DB::transaction(function () use ($apiKey, $graceHours): IssuedApiKeyData {
            $lockedApiKey = ApiKey::query()->whereKey($apiKey->id)->lockForUpdate()->firstOrFail();
            $secret = ApiKey::generateSecretWithPrefix($lockedApiKey->key_prefix);

            $lockedApiKey->forceFill([
                'previous_key_hash' => $lockedApiKey->key_hash,
                'previous_key_valid_until' => now()->addHours($graceHours),
                'key_hash' => $secret['hash'],
            ])->save();

            return new IssuedApiKeyData($lockedApiKey, $secret['plain']);
        });

        activity('api-keys')
            ->causedBy($actor)
            ->performedOn($issuedApiKey->apiKey)
            ->event('rotated')
            ->withProperties([
                'name' => $issuedApiKey->apiKey->name,
                'key_prefix' => $issuedApiKey->apiKey->key_prefix,
                'scopes' => $issuedApiKey->apiKey->scopes,
                'previous_key_valid_until' => $issuedApiKey->apiKey->previous_key_valid_until?->toIso8601String(),
            ])
            ->log('API key rotated');

        return $issuedApiKey;
    }
}
