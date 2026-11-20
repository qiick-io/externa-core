<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Models\ApiKey;
use Illuminate\Contracts\Events\Dispatcher;
use Laravel\Passport\Bridge\RefreshTokenRepository as PassportRefreshTokenRepository;
use Laravel\Passport\Passport;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;

/**
 * Passport refresh-token persistence with RFC 9700 §4.14.2 reuse detection (#815).
 *
 * When a previously rotated (revoked) refresh token is presented again, every access and
 * refresh token in that family is revoked, and the grant row is revoked, so a stolen old
 * refresh token cannot keep minting.
 */
final class McpOAuthRefreshTokenRepositoryService extends PassportRefreshTokenRepository
{
    public function __construct(Dispatcher $events)
    {
        parent::__construct($events);
    }

    public function isRefreshTokenRevoked(string $tokenId): bool
    {
        /** @var RefreshToken|null $refreshToken */
        $refreshToken = Passport::refreshToken()->newQuery()->whereKey($tokenId)->first();

        if ($refreshToken === null) {
            return true;
        }

        if ($refreshToken->revoked) {
            $this->revokeTokenFamily((string) $refreshToken->access_token_id);

            return true;
        }

        return false;
    }

    /**
     * Revoke every credential that shares the access token's client, user and grant.
     */
    private function revokeTokenFamily(string $accessTokenId): void
    {
        /** @var Token|null $accessToken */
        $accessToken = Token::query()->find($accessTokenId);

        if ($accessToken === null) {
            return;
        }

        $familyTokenIds = Token::query()
            ->where('client_id', $accessToken->client_id)
            ->where('user_id', $accessToken->user_id)
            ->when(
                $accessToken->getAttribute('api_key_id') !== null,
                static fn ($query) => $query->where('api_key_id', $accessToken->getAttribute('api_key_id')),
            )
            ->pluck('id');

        Token::query()->whereIn('id', $familyTokenIds)->update(['revoked' => true]);
        RefreshToken::query()->whereIn('access_token_id', $familyTokenIds)->update(['revoked' => true]);

        $grantId = $accessToken->getAttribute('api_key_id');

        if ($grantId !== null) {
            ApiKey::query()
                ->whereKey($grantId)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);
        }
    }
}
