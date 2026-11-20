<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * What the authorization endpoint requires on top of Passport's own checks (#802 / #815):
 *
 * - PKCE with `S256` (OAuth 2.1, MCP authorization): a request without a code challenge method,
 *   or with `plain`, is refused with `invalid_request`;
 * - the RFC 8707 `resource`, when sent, is this server's MCP endpoint; any other is refused with
 *   `invalid_target`. A request without one is for the MCP endpoint, the only resource here.
 *
 * Wire scopes other than laravel/mcp's `mcp:use` (API-key scopes, `openid`, …) are dropped rather
 * than failing the request (RFC 6749 §3.3); an empty list after filtering lets Passport apply its
 * default (`mcp:use`). The consent screen maps `mcp:use` to the grant's API-key scopes.
 *
 * Errors are answered here as JSON rather than redirected: they are raised before Passport has
 * validated the redirect URI, and an unvalidated redirect URI must never receive a redirect.
 */
class ValidateMcpOAuthAuthorizationRequestMiddleware
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        // A request without PKCE has no method either, so this also refuses it (league refuses a
        // public client without a challenge too); `plain` is refused only here.
        if (! in_array($request->query('code_challenge_method'), McpOAuthServerService::SUPPORTED_CODE_CHALLENGE_METHODS, true)) {
            return self::oauthError('invalid_request', 'PKCE with code_challenge_method S256 is required.');
        }

        if (! $this->oauthServer->acceptsResource($request->query->all()['resource'] ?? null)) {
            return self::oauthError('invalid_target', 'The requested resource is not served by this authorization server.');
        }

        $requestedScope = $request->query('scope');

        if (is_string($requestedScope)) {
            $request->query->set('scope', implode(' ', array_values(array_filter(
                preg_split('/\s+/', trim($requestedScope)) ?: [],
                static fn (string $scope): bool => $scope === McpOAuthServerService::WIRE_SCOPE,
            ))));
        }

        return $next($request);
    }

    /**
     * An RFC 6749 §5.2 error body.
     */
    public static function oauthError(string $error, string $description): JsonResponse
    {
        return response()->json(['error' => $error, 'error_description' => $description], 400);
    }
}
