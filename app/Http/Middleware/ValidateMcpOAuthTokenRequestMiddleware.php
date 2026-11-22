<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Mcp\McpOAuthRedirectUriService;
use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\Request;
use Laravel\Passport\Client;
use Symfony\Component\HttpFoundation\Response;

/**
 * What the token endpoint requires on top of Passport's own checks (#802):
 *
 * - only the authorization code and refresh token grants (`unsupported_grant_type` otherwise);
 * - the RFC 8707 `resource` must name this MCP endpoint (`invalid_target` otherwise);
 * - the client's redirect host is not on the admin block list.
 */
class ValidateMcpOAuthTokenRequestMiddleware
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
        private readonly McpOAuthRedirectUriService $redirectUriService,
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
                'The resource parameter is required and must name this MCP endpoint.',
            );
        }

        $clientId = $request->input('client_id');

        if (! is_string($clientId) || $clientId === '') {
            // Public clients may send only HTTP Basic (client_id as username, empty password).
            $clientId = $request->getUser();
        }

        if (is_string($clientId) && $clientId !== '') {
            $client = Client::query()->whereKey($clientId)->where('revoked', false)->first();

            if ($client instanceof Client && $this->redirectUriService->clientHasBlockedRedirectHost($client)) {
                return ValidateMcpOAuthAuthorizationRequestMiddleware::oauthError(
                    'invalid_client',
                    'The client redirect host is blocked on this server.',
                );
            }
        }

        return $next($request);
    }
}
