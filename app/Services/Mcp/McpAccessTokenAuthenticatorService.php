<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Enums\ApiKeyScopeEnum;
use App\Exceptions\ApiKeyRejectedException;
use App\Models\ApiKey;
use App\Services\Api\ApiKeyAuthenticatorService;
use Illuminate\Http\Request;
use Laravel\Passport\Client;
use Laravel\Passport\Token;
use Lcobucci\JWT\Validation\Constraint\LooseValidAt;
use Lcobucci\JWT\Validation\RequiredConstraintsViolated;
use League\OAuth2\Server\Exception\OAuthServerException;
use League\OAuth2\Server\ResourceServer;
use Psr\Http\Message\ServerRequestInterface;
use Symfony\Bridge\PsrHttpMessage\Factory\PsrHttpFactory;

/**
 * The OAuth door of the MCP endpoint (#802): turns a presented access token into the grant row
 * it was issued under, then hands that row to the same checks an API key goes through.
 *
 * In order, each failure answering `401 invalid_token` (RFC 6750) unless noted:
 *
 * 1. Passport's resource server verifies the signature, the expiry and that the token row is not
 *    revoked (a purged row counts as revoked).
 * 2. The token names this endpoint as its audience (RFC 8707): a token recorded for another
 *    resource, or for none, is refused even though this server issued it.
 * 3. Its client still exists and is not revoked.
 * 4. It is bound to a grant row for the same client and the same user.
 * 5. Its wire scopes are exactly `mcp:use` (laravel/mcp). The grant row holds the narrowed
 *    API-key scopes; replacing a grant revokes earlier tokens, so a stale code cannot keep
 *    wider access.
 * 6. {@see ApiKeyAuthenticatorService::authorizeCredential()} on the grant row: revocation,
 *    owner, role, scopes, `mcp:read` (`403 insufficient_scope`), usage. The very code an API key
 *    passes through, so the two doors cannot disagree.
 *
 * Nothing is cached: revoking a grant or a token is effective on the next call.
 */
final class McpAccessTokenAuthenticatorService
{
    public function __construct(
        private readonly ApiKeyAuthenticatorService $apiKeyAuthenticator,
        private readonly McpOAuthServerService $oauthServer,
        private readonly McpOAuthRedirectUriService $redirectUriService,
    ) {}

    /**
     * The grant row the access token acts under, checked for this request.
     *
     * @throws ApiKeyRejectedException
     */
    public function authenticate(Request $request): ApiKey
    {
        $verifiedRequest = $this->verifySignedToken($request);

        $tokenId = (string) $verifiedRequest->getAttribute('oauth_access_token_id');
        $clientId = (string) $verifiedRequest->getAttribute('oauth_client_id');
        $userId = (string) $verifiedRequest->getAttribute('oauth_user_id');
        /** @var mixed $tokenScopes */
        $tokenScopes = $verifiedRequest->getAttribute('oauth_scopes');

        $token = Token::query()->find($tokenId);

        if (! $token instanceof Token) {
            throw ApiKeyRejectedException::revokedKey(isAccessToken: true);
        }

        if ($token->getAttribute('audience') !== $this->oauthServer->resourceIdentifier()) {
            throw ApiKeyRejectedException::invalidAccessToken(__('The access token was issued for another resource.'));
        }

        // Not ClientRepository::findActive(), which memoizes the client for the life of the
        // repository: a client revoked a moment ago must be refused on the very next call.
        $client = Client::query()->whereKey($clientId)->where('revoked', false)->first();

        if (! $client instanceof Client) {
            throw ApiKeyRejectedException::invalidAccessToken(__('The client this access token was issued to has been revoked.'));
        }

        if ($this->redirectUriService->clientHasBlockedRedirectHost($client)) {
            throw ApiKeyRejectedException::invalidAccessToken(__('The client redirect host is blocked on this server.'));
        }

        $grant = $this->grantFor($token, $clientId, $userId);

        if (! $this->hasWireScope($tokenScopes)) {
            throw ApiKeyRejectedException::invalidAccessToken(__('The access token no longer matches what was authorized. Authorize the client again.'));
        }

        $this->apiKeyAuthenticator->authorizeCredential(
            $request,
            $grant,
            isOwnerRequired: true,
            requiredScope: ApiKeyScopeEnum::McpRead,
        );

        return $grant;
    }

    /**
     * Signature, expiry and revocation, by Passport's resource server (league/oauth2-server).
     *
     * @throws ApiKeyRejectedException
     */
    private function verifySignedToken(Request $request): ServerRequestInterface
    {
        try {
            return app(ResourceServer::class)->validateAuthenticatedRequest(
                (new PsrHttpFactory)->createRequest($request),
            );
        } catch (OAuthServerException $exception) {
            if ($exception->getHint() === 'Access token has been revoked') {
                throw ApiKeyRejectedException::revokedKey(isAccessToken: true);
            }

            if ($this->isExpiry($exception)) {
                throw ApiKeyRejectedException::expiredKey(isAccessToken: true);
            }

            throw ApiKeyRejectedException::invalidAccessToken(__('The access token is not valid.'));
        }
    }

    private function isExpiry(OAuthServerException $exception): bool
    {
        $violations = $exception->getPrevious();

        if (! $violations instanceof RequiredConstraintsViolated) {
            return false;
        }

        foreach ($violations->violations() as $violation) {
            if ($violation->constraint === LooseValidAt::class) {
                return true;
            }
        }

        return false;
    }

    /**
     * The grant row the token was bound to when it was issued, for the same client and user.
     *
     * @throws ApiKeyRejectedException
     */
    private function grantFor(Token $token, string $clientId, string $userId): ApiKey
    {
        $grantId = $token->getAttribute('api_key_id');
        $grant = $grantId !== null
            ? ApiKey::query()->with(['role', 'owner'])->find($grantId)
            : null;

        if (
            ! $grant instanceof ApiKey
            || $grant->oauth_client_id !== $clientId
            || (string) $grant->owner_id !== $userId
            || (string) $token->getAttribute('client_id') !== $clientId
        ) {
            throw ApiKeyRejectedException::invalidAccessToken(__('The access token is not bound to an authorization.'));
        }

        return $grant;
    }

    /**
     * Whether the token carries exactly laravel/mcp's `mcp:use` wire scope. The grant row's
     * API-key scopes authorize the call in {@see ApiKeyAuthenticatorService::authorizeCredential()}.
     */
    private function hasWireScope(mixed $tokenScopes): bool
    {
        if (! is_array($tokenScopes)) {
            return false;
        }

        $normalized = array_values(array_unique(array_map(
            static fn (mixed $scope): string => (string) $scope,
            $tokenScopes,
        )));
        sort($normalized);

        return $normalized === [McpOAuthServerService::WIRE_SCOPE];
    }
}
