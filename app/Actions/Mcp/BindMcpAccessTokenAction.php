<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\ApiKey;
use App\Services\Mcp\McpOAuthServerService;
use Laravel\Passport\Token;

/**
 * Bind a freshly issued OAuth access token to the grant it acts under and record its audience
 * (#802). Runs inside the token request, right after Passport stored the token, for the
 * authorization code and the refresh token grant alike.
 *
 * The grant is the user's active (not revoked) grant row for the token's client. The audience is
 * the MCP endpoint's resource identifier: the token endpoint refuses any other `resource` before
 * a token is minted, so every token this server issues is for `/mcp`, and saying so on the token
 * lets the endpoint refuse one recorded for anything else.
 *
 * A token with no user, or with no active grant behind it (the grant was revoked between consent
 * and the code exchange), is revoked at once rather than left usable: it can never authorize a
 * call, and a client that tries learns `invalid_token` and starts over.
 */
final class BindMcpAccessTokenAction
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function execute(string $tokenId, ?string $userId, string $clientId): void
    {
        $grant = $userId === null ? null : ApiKey::query()
            ->where('oauth_client_id', $clientId)
            ->where('owner_id', $userId)
            ->whereNull('revoked_at')
            ->latest('id')
            ->first();

        if (! $grant instanceof ApiKey) {
            Token::query()->whereKey($tokenId)->update(['revoked' => true]);

            return;
        }

        Token::query()->whereKey($tokenId)->update([
            'api_key_id' => $grant->id,
            'audience' => $this->oauthServer->resourceIdentifier(),
        ]);
    }
}
