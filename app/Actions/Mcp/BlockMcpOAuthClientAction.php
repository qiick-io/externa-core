<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\ApiKey;
use App\Models\User;
use App\Services\Mcp\McpClientCredentialsService;
use Illuminate\Support\Facades\DB;
use Laravel\Passport\Client;

/**
 * Block a dynamically registered MCP OAuth client (#815 / #816): revoke the client row and every
 * grant and Passport credential it holds, so the next call, refresh and consent fail the same way
 * as a user revocation from Connected apps.
 */
final class BlockMcpOAuthClientAction
{
    public function __construct(
        private readonly McpClientCredentialsService $clientCredentials,
    ) {}

    public function execute(Client $client, User $actor): void
    {
        DB::transaction(function () use ($client, $actor): void {
            $client->forceFill(['revoked' => true])->save();

            ApiKey::query()
                ->where('oauth_client_id', $client->getKey())
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            $this->clientCredentials->revokeAllIssuedCredentials((string) $client->getKey());

            activity('api-keys')
                ->causedBy($actor)
                ->event('oauth_client_blocked')
                ->withProperties([
                    'oauth_client_id' => (string) $client->getKey(),
                    'name' => $client->name,
                ])
                ->log('MCP OAuth client blocked');
        });
    }
}
