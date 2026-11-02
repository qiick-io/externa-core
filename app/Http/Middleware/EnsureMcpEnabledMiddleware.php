<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Fail closed when the optional MCP HTTP endpoint is disabled.
 */
class EnsureMcpEnabledMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! (bool) config('ai.mcp.enabled', false)) {
            abort(404);
        }

        return $next($request);
    }
}
