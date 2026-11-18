<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hide the AI item draft endpoint (404) while `AI_ITEM_DRAFTS` is off.
 *
 * A disabled feature answers like a route that does not exist (as the MCP endpoint does), so
 * a 403 never suggests that a permission is missing when the operator has not turned it on.
 */
class EnsureAiItemDraftsEnabledMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! (bool) config('ai.item_drafts.enabled', false)) {
            abort(404);
        }

        return $next($request);
    }
}
