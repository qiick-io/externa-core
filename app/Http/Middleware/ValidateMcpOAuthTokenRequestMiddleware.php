<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * What the token endpoint requires on top of Passport's own checks (#802):
 *
 * - only the authorization code and refresh token grants (`unsupported_grant_type` otherwise).
 *   Passport also enables client credentials, which a self-registered public client can never
 *   use; refusing it here keeps the grant list the discovery document publishes the whole truth;
 * - the RFC 8707 `resource`, when sent, is this server's MCP endpoint (`invalid_target`).
 */
class ValidateMcpOAuthTokenRequestMiddleware
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->input('grant_type'), McpOAuthServerService::SUPPORTED_GRANT_TYPES, true)) {
            return ValidateMcpOAuthAuthorizationRequestMiddleware::oauthError(
                'unsupported_grant_type',
                'Only the authorization_code and refresh_token grants are supported.',
            );
        }

        if (! $this->oauthServer->acceptsResource($request->request->all()['resource'] ?? null)) {
            return ValidateMcpOAuthAuthorizationRequestMiddleware::oauthError(
                'invalid_target',
                'The requested resource is not served by this authorization server.',
            );
        }

        return $next($request);
    }
}
