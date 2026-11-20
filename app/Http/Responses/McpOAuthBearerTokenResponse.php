<?php

declare(strict_types=1);

namespace App\Http\Responses;

use League\OAuth2\Server\Entities\AccessTokenEntityInterface;
use League\OAuth2\Server\Entities\ScopeEntityInterface;
use League\OAuth2\Server\ResponseTypes\BearerTokenResponse;
use SensitiveParameter;

/**
 * The token endpoint's response for remote MCP clients (#802), with the granted `scope`.
 *
 * RFC 6749 §5.1 makes `scope` required when it differs from what the client asked for.
 * league/oauth2-server leaves it out; the wire scope is laravel/mcp's `mcp:use`, and the consent
 * screen's narrowing lives on the grant row rather than on the token.
 */
final class McpOAuthBearerTokenResponse extends BearerTokenResponse
{
    /**
     * @return array{scope: string}
     */
    protected function getExtraParams(
        #[SensitiveParameter]
        AccessTokenEntityInterface $accessToken,
    ): array {
        return [
            'scope' => implode(' ', array_map(
                static fn (ScopeEntityInterface $scope): string => $scope->getIdentifier(),
                $accessToken->getScopes(),
            )),
        ];
    }
}
