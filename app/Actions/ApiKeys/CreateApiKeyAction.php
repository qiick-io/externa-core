<?php

declare(strict_types=1);

namespace App\Actions\ApiKeys;

use App\Data\Api\ApiKeyData;
use App\Data\Api\IssuedApiKeyData;
use App\Enums\ApiKeyScopeEnum;
use App\Models\ApiKey;

/**
 * Issue a new API key. Only the SHA-256 of the token is stored; the plain token is returned
 * once, for the response that shows it.
 *
 * Side effect: writes a `created` entry to the `api-keys` activity log (name, prefix, scopes;
 * never the token or its hash).
 */
final class CreateApiKeyAction
{
    public function execute(ApiKeyData $apiKeyData): IssuedApiKeyData
    {
        $secret = ApiKey::generateSecret();

        $apiKey = ApiKey::query()->create([
            'name' => $apiKeyData->name,
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => $apiKeyData->roleId,
            'collection_slugs' => $apiKeyData->collectionSlugs,
            'scopes' => array_map(static fn (ApiKeyScopeEnum $scope): string => $scope->value, $apiKeyData->scopes),
            'ip_allowlist' => $apiKeyData->ipAllowlist,
            'rate_limit_per_minute' => $apiKeyData->rateLimitPerMinute,
            'expires_at' => $apiKeyData->expiresAt,
            'created_by' => $apiKeyData->creator->id,
            'owner_id' => $apiKeyData->ownerId,
        ]);

        activity('api-keys')
            ->causedBy($apiKeyData->creator)
            ->performedOn($apiKey)
            ->event('created')
            ->withProperties([
                'name' => $apiKey->name,
                'key_prefix' => $apiKey->key_prefix,
                'scopes' => $apiKey->scopes,
            ])
            ->log('API key created');

        return new IssuedApiKeyData($apiKey, $secret['plain']);
    }
}
