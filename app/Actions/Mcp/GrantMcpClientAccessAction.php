<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Data\Mcp\McpClientGrantData;
use App\Enums\ApiKeyScopeEnum;
use App\Models\ApiKey;
use App\Services\Mcp\McpClientCredentialsService;
use App\Services\Mcp\McpOAuthRedirectUriService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Record what a user approved for a remote MCP client (#802): the grant row every access token
 * for that client acts under.
 *
 * One active grant per user and client. Approving again starts a new grant row (the previous
 * active row is revoked in place for the audit trail) and revokes every token, refresh token and
 * unused authorization code the client held, so presenting an old refresh token cannot revoke the
 * new grant via family reuse detection. A revoked grant stays as it is; approving afterwards
 * starts a new one.
 *
 * The row has a random, never-shown `key_hash` and a `key_prefix` that is not token-shaped, so
 * it can never be presented as an API key.
 *
 * Side effect: writes an `oauth_authorized` entry to the `api-keys` activity log naming the
 * client, its redirect host and what was granted.
 */
final class GrantMcpClientAccessAction
{
    public function __construct(
        private readonly McpClientCredentialsService $clientCredentials,
    ) {}

    public function execute(McpClientGrantData $grantData): ApiKey
    {
        return DB::transaction(function () use ($grantData): ApiKey {
            $previousGrant = ApiKey::query()
                ->where('oauth_client_id', $grantData->client->getKey())
                ->where('owner_id', $grantData->user->id)
                ->whereNull('revoked_at')
                ->lockForUpdate()
                ->first();

            if ($previousGrant instanceof ApiKey) {
                $previousGrant->forceFill(['revoked_at' => now()])->save();
            }

            $grant = ApiKey::query()->create([
                'name' => $grantData->client->name,
                'role_id' => $grantData->roleId,
                'scopes' => array_map(static fn (ApiKeyScopeEnum $scope): string => $scope->value, $grantData->scopes),
                'collection_slugs' => $grantData->collectionSlugs,
                'key_prefix' => 'oauth_'.Str::random(8),
                'key_hash' => ApiKey::hashSecret(Str::random(64)),
                'oauth_client_id' => $grantData->client->getKey(),
                'owner_id' => $grantData->user->id,
                'created_by' => $grantData->user->id,
            ]);

            $this->clientCredentials->revokeIssuedCredentials((string) $grantData->client->getKey(), $grantData->user->id);

            activity('api-keys')
                ->causedBy($grantData->user)
                ->performedOn($grant)
                ->event('oauth_authorized')
                ->withProperties([
                    'name' => $grant->name,
                    'oauth_client_id' => $grant->oauth_client_id,
                    'redirect_host' => app(McpOAuthRedirectUriService::class)->rawHostOf($grantData->redirectUri),
                    'role_id' => $grant->role_id,
                    'scopes' => $grant->scopes,
                    'collection_slugs' => $grant->collection_slugs,
                ])
                ->log('MCP client authorized');

            return $grant;
        });
    }
}
