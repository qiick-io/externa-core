<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use Laravel\Passport\AuthCode;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;

/**
 * Everything Passport issued to one remote MCP client for one user (#802): access tokens,
 * their refresh tokens and unused authorization codes. Revoked together whenever what the client
 * may do changes (a new consent, a revocation, the owner leaving), so a connector can never keep
 * using, refresh, or exchange its way back to access the user withdrew.
 *
 * Revoked, not deleted: `passport:purge` clears them later, and the grant row keeps the audit
 * trail.
 */
final class McpClientCredentialsService
{
    public function revokeIssuedCredentials(string $clientId, int $userId): void
    {
        $tokenIds = Token::query()
            ->where('client_id', $clientId)
            ->where('user_id', $userId)
            ->pluck('id');

        Token::query()->whereIn('id', $tokenIds)->update(['revoked' => true]);
        RefreshToken::query()->whereIn('access_token_id', $tokenIds)->update(['revoked' => true]);
        AuthCode::query()->where('client_id', $clientId)->where('user_id', $userId)->update(['revoked' => true]);
    }

    /**
     * Revoke every credential the client holds for any user (admin block of the client).
     */
    public function revokeAllIssuedCredentials(string $clientId): void
    {
        $tokenIds = Token::query()->where('client_id', $clientId)->pluck('id');

        Token::query()->whereIn('id', $tokenIds)->update(['revoked' => true]);
        RefreshToken::query()->whereIn('access_token_id', $tokenIds)->update(['revoked' => true]);
        AuthCode::query()->where('client_id', $clientId)->update(['revoked' => true]);
    }
}
