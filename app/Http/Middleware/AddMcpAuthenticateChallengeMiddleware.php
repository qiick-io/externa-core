<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\Request;
use Laravel\Mcp\Server\Middleware\AddWwwAuthenticateHeader;
use Symfony\Component\HttpFoundation\Response;

/**
 * The `WWW-Authenticate` challenge of `/mcp`, in place of laravel/mcp's
 * {@see AddWwwAuthenticateHeader}, which overwrites the header on every 401 and so drops the
 * RFC 6750 error code the API keys return since #781.
 *
 * - OAuth off (the default): every 401 says `Bearer realm="mcp", error="invalid_token"`, exactly
 *   what laravel/mcp's middleware sent before, so an install without OAuth sees no change.
 * - OAuth on: the challenge also names the protected resource metadata (RFC 9728 §5.1), which is
 *   how a remote MCP client finds the authorization server. A request without credentials gets
 *   no error code (RFC 6750 §3.1); a refused token keeps `invalid_token`, and a 403 keeps
 *   `insufficient_scope` with the `scope` it needs, so a client can step up.
 */
class AddMcpAuthenticateChallengeMiddleware
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $statusCode = $response->getStatusCode();

        if ($statusCode !== 401 && $statusCode !== 403) {
            return $response;
        }

        if (! $this->oauthServer->isEnabled()) {
            if ($statusCode === 401) {
                $response->headers->set('WWW-Authenticate', 'Bearer realm="mcp", error="invalid_token"');
            }

            return $response;
        }

        $challenge = (string) $response->headers->get('WWW-Authenticate', '');

        if ($statusCode === 403 && ! str_starts_with($challenge, 'Bearer ')) {
            return $response;
        }

        $challengeParameters = ['realm="mcp"', sprintf('resource_metadata="%s"', $this->oauthServer->protectedResourceMetadataUrl())];

        if (str_starts_with($challenge, 'Bearer ')) {
            $challengeParameters[] = substr($challenge, strlen('Bearer '));
        } elseif ($request->bearerToken() !== null) {
            $challengeParameters[] = 'error="invalid_token"';
        }

        $response->headers->set('WWW-Authenticate', 'Bearer '.implode(', ', $challengeParameters));

        return $response;
    }
}
