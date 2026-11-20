<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every OAuth and discovery route answers 404 until OAuth for remote MCP clients is on (#802),
 * so an install that never enables it serves exactly what it served before. When OAuth is on but
 * Passport keys are missing, the same routes answer a clear 503 (JSON or Inertia), never a 500
 * from league/oauth2-server. Checked per request rather than at route registration, so a cached
 * route table follows the configuration.
 */
class EnsureMcpOAuthEnabledMiddleware
{
    public function __construct(
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->oauthServer->isEnabled()) {
            abort(404);
        }

        if (! $this->oauthServer->hasPassportKeys()) {
            return $this->missingKeysResponse($request);
        }

        return $next($request);
    }

    private function missingKeysResponse(Request $request): Response
    {
        $message = __('OAuth for MCP is enabled but Passport signing keys are missing. Run `php artisan passport:keys`, or set PASSPORT_PRIVATE_KEY and PASSPORT_PUBLIC_KEY.');

        if ($request->expectsJson() || ! $request->is('oauth/authorize')) {
            return response()->json([
                'error' => 'temporarily_unavailable',
                'error_description' => $message,
            ], 503);
        }

        abort(503, $message);
    }
}
