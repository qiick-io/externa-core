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
 * Rotation uses an atomic `UPDATE … WHERE revoked = 0`: zero rows updated means the token was
 * already revoked (reuse or a concurrent winner), and the whole token family is revoked. A
 * presented revoked or purged refresh token likewise revokes the family.
 */
final class McpOAuthRefreshTokenRepositoryService extends PassportRefreshTokenRepository
{
    public function __construct(Dispatcher $events)
    {
        parent::__construct($events);
    }

    public function revokeRefreshToken(string $tokenId): void
    {
        $updated = Passport::refreshToken()->newQuery()
            ->whereKey($tokenId)
            ->where('revoked', false)
            ->update(['revoked' => true]);

        if ($updated === 0) {
            $this->revokeFamilyForRefreshTokenId($tokenId);
        }
    }

    public function isRefreshTokenRevoked(string $tokenId): bool
    {
        /** @var RefreshToken|null $refreshToken */
        $refreshToken = Passport::refreshToken()->newQuery()->whereKey($tokenId)->first();

        if ($refreshToken === null) {
            // Purged row: still refuse; family revocation needs the access token id (unavailable).
            return true;
        }

        if ($refreshToken->revoked) {
            $this->revokeTokenFamily((string) $refreshToken->access_token_id);

            return true;
        }

        return false;
    }

    private function revokeFamilyForRefreshTokenId(string $tokenId): void
    {
        /** @var RefreshToken|null $refreshToken */
        $refreshToken = Passport::refreshToken()->newQuery()->whereKey($tokenId)->first();

        if ($refreshToken === null) {
            return;
        }

        $this->revokeTokenFamily((string) $refreshToken->access_token_id);
    }

    /**
     * Revoke every credential that shares the access token's client, user and grant.
     */
    private function revokeTokenFamily(string $accessTokenId): void
    {
        /** @var Token|null $accessToken */
        $accessToken = Token::query()->find($accessTokenId);

        if ($accessToken === null) {
            // Access token purged: still withdraw refresh tokens bound to that id.
            RefreshToken::query()->where('access_token_id', $accessTokenId)->update(['revoked' => true]);

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
