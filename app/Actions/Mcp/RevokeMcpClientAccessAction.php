<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\ApiKey;
use App\Models\User;
use App\Services\Mcp\McpClientCredentialsService;
use Illuminate\Support\Facades\DB;

/**
 * Revoke a remote MCP client's grant (#802), from the user's settings: the grant row and every
 * token, refresh token and code the client holds for its owner, in one transaction. Nothing is
 * cached, so the client's next call is refused with `invalid_token` and its next refresh with
 * `invalid_grant`. The row stays, revoked, for the audit trail; approving the client again later
 * starts a new grant.
 *
 * Revoking an already revoked grant changes nothing and logs nothing.
 *
 * Side effect: writes an `oauth_revoked` entry to the `api-keys` activity log naming the client.
 */
final class RevokeMcpClientAccessAction
{
    public function __construct(
        private readonly McpClientCredentialsService $clientCredentials,
    ) {}

    public function execute(ApiKey $grant, User $actor): void
    {
        if (! $grant->isOAuthGrant() || $grant->isRevoked() || $grant->owner_id === null) {
            return;
        }

        DB::transaction(function () use ($grant, $actor): void {
            $grant->forceFill(['revoked_at' => now()])->save();
            $this->clientCredentials->revokeIssuedCredentials((string) $grant->oauth_client_id, (int) $grant->owner_id);

            activity('api-keys')
                ->causedBy($actor)
                ->performedOn($grant)
                ->event('oauth_revoked')
                ->withProperties([
                    'name' => $grant->name,
                    'oauth_client_id' => $grant->oauth_client_id,
                    'scopes' => $grant->scopes,
                ])
                ->log('MCP client access revoked');
        });
    }
}
