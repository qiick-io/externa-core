<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Data\Api\ApiAccessData;
use App\Enums\ApiKeyScopeEnum;
use App\Exceptions\ApiKeyRejectedException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuse an API key that lacks the scope a public API route needs, before the route runs, with
 * the RFC 6750 `insufficient_scope` answer naming that scope. Runs after
 * {@see ResolveApiAccessMiddleware}; public (keyless) requests pass, since their role alone
 * decides. The collection and file enforcers apply the same scopes again inside the request
 * (includes, file fields), so this gate is the clear answer, not the only check.
 *
 * Usage: `RequireApiKeyScopeMiddleware::class.':collections:read'`.
 */
class RequireApiKeyScopeMiddleware
{
    public function handle(Request $request, Closure $next, string $requiredScopeValue): Response
    {
        $requiredScope = ApiKeyScopeEnum::from($requiredScopeValue);
        $access = $request->attributes->get('apiAccess');
        $apiKey = $access instanceof ApiAccessData ? $access->apiKey : null;

        if ($apiKey !== null && ! $apiKey->hasScope($requiredScope)) {
            throw ApiKeyRejectedException::insufficientScope($requiredScope);
        }

        return $next($request);
    }
}
