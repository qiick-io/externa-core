<?php

namespace App\Http\Middleware;

use App\Support\Api\ApiAccess;
use App\Support\Api\PublicApiIncludeParser;
use App\Support\Validation\FilterQueryLimits;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cost-bucket limiter for Public CMS API + GraphQL (after ResolveApiAccessMiddleware).
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

        RateLimiter::increment($key, 60, $cost);

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
        $relationFilterCost = (int) config('api.cost.filter_relation', 2);
        $mutationCost = (int) config('api.cost.mutation', 5);

        // GraphQL: complexity is not available before Lighthouse validation —
        // charge base (+ relational filter keys from variables/inline JSON when present);
        // depth/complexity caps live in config/lighthouse.php.
        if ($request->is('api/graphql') || $request->routeIs('graphql')) {
            return max(1, $base) + ($this->relationalFilterKeyCount($request) * max(0, $relationFilterCost));
        }

        $cost = max(1, $base);

        if (in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $cost += max(0, $mutationCost) * $this->batchEntryCount($request);
        }

        $tokens = app(PublicApiIncludeParser::class)->parse($request->query('include'));
        $cost += count($tokens) * max(0, $includeCost);
        $cost += $this->relationalFilterKeyCount($request) * max(0, $relationFilterCost);

        return $cost;
    }

    /**
     * Entries a write carries: the size of `items` (batch create / update) or `ids` (batch
     * delete) on `/items/batch`, else 1. A 100-item batch is charged like 100 writes (#441).
     * Capped at `api.max_batch_size`, the most the batch endpoints accept.
     */
    private function batchEntryCount(Request $request): int
    {
        if (! $request->is('api/v1/collections/*/items/batch')) {
            return 1;
        }

        $entries = $request->input($request->isMethod('DELETE') ? 'ids' : 'items');
        $count = is_array($entries) ? count($entries) : 1;

        return max(1, min($count, (int) config('api.max_batch_size', 100)));
    }

    /**
     * Count dotted filter keys on REST `?filter=` or GraphQL JSON `filter` argument.
     */
    private function relationalFilterKeyCount(Request $request): int
    {
        if ($request->is('api/graphql') || $request->routeIs('graphql')) {
            return FilterQueryLimits::relationalKeyCount($this->graphQlFilterMap($request));
        }

        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            return 0;
        }

        /** @var array<string, mixed> $filters */
        return FilterQueryLimits::relationalKeyCount($filters);
    }

    /**
     * Best-effort extract of the items `filter` map from a GraphQL HTTP body.
     *
     * @return array<string, mixed>
     */
    private function graphQlFilterMap(Request $request): array
    {
        $payload = $request->all();
        $variables = $payload['variables'] ?? null;
        if (is_array($variables) && isset($variables['filter']) && is_array($variables['filter'])) {
            /** @var array<string, mixed> $filter */
            $filter = $variables['filter'];

            return $filter;
        }

        $query = $payload['query'] ?? null;
        if (! is_string($query) || ! str_contains($query, 'filter')) {
            return [];
        }

        // Inline filter: filter: { ... } — only dotted keys matter for cost; skip fragile parse.
        return [];
    }
}
