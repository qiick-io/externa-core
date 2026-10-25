<?php

namespace App\Http\Middleware;

use App\Support\Api\ApiAccess;
use App\Support\Api\PublicApiIncludeParser;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cost-bucket limiter for Public CMS API + GraphQL (after ResolveApiAccess).
 *
 * Stacks with throttle:api and per-key rate_limit_per_minute; disabled when
 * config('api.cost_limit') is 0.
 */
class ApiRequestCostMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $bodyLimit = (int) config('api.max_body_bytes', 0);
        if ($bodyLimit > 0) {
            $contentLength = $request->headers->get('Content-Length');
            if (is_numeric($contentLength) && (int) $contentLength > $bodyLimit) {
                return response()->json([
                    'message' => 'Request body too large.',
                ], 413);
            }
        }

        $limit = (int) config('api.cost_limit', 0);
        if ($limit <= 0) {
            return $next($request);
        }

        $cost = $this->costFor($request);
        $key = $this->bucketKey($request);

        if (RateLimiter::attempts($key) + $cost > $limit) {
            $retryAfter = RateLimiter::availableIn($key);

            return response()->json([
                'message' => 'API cost budget exceeded.',
            ], 429)->withHeaders([
                'Retry-After' => (string) max(1, $retryAfter),
                'X-RateLimit-Limit' => (string) $limit,
                'X-RateLimit-Remaining' => '0',
            ]);
        }

        for ($i = 0; $i < $cost; $i++) {
            RateLimiter::hit($key, 60);
        }

        $remaining = max(0, $limit - RateLimiter::attempts($key));

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-RateLimit-Limit', (string) $limit);
        $response->headers->set('X-RateLimit-Remaining', (string) $remaining);

        return $response;
    }

    private function bucketKey(Request $request): string
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess && $access->apiKey !== null) {
            return 'api-cost:'.$access->apiKey->id;
        }

        $userId = $request->user()?->id;
        if ($userId !== null) {
            return 'api-cost:'.$userId;
        }

        return 'api-cost:'.(string) $request->ip();
    }

    private function costFor(Request $request): int
    {
        $base = (int) config('api.cost.base', 1);
        $includeCost = (int) config('api.cost.include', 2);
        $mutationCost = (int) config('api.cost.mutation', 5);

        // GraphQL: complexity is not available before Lighthouse validation —
        // charge base only here; depth/complexity caps live in config/lighthouse.php.
        if ($request->is('api/graphql') || $request->routeIs('graphql')) {
            return max(1, $base);
        }

        $cost = max(1, $base);

        if (in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $cost += max(0, $mutationCost);
        }

        $tokens = app(PublicApiIncludeParser::class)->parse($request->query('include'));
        $cost += count($tokens) * max(0, $includeCost);

        return $cost;
    }
}
