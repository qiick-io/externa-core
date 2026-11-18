<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Data\Api\ApiAccessData;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Services\Api\ApiKeyAuthenticatorService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolve public vs API-key actor for /api/v1 and bind ApiAccessData on the container.
 *
 * A Bearer token is judged by {@see ApiKeyAuthenticatorService} (the same checks and the same
 * RFC 6750 answers as MCP), then held to the key's `rate_limit_per_minute`.
 */
class ResolveApiAccessMiddleware
{
    public function __construct(
        private readonly ApiKeyAuthenticatorService $apiKeyAuthenticator,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $bearer = $request->bearerToken();

        if ($bearer !== null && $bearer !== '') {
            $access = $this->resolveFromApiKey($request, $bearer);
        } else {
            $access = $this->resolvePublic();
        }

        app()->instance(ApiAccessData::class, $access);
        $request->attributes->set('apiAccess', $access);

        return $next($request);
    }

    private function resolvePublic(): ApiAccessData
    {
        $role = Role::query()
            ->where('name', RoleEnum::Public->value)
            ->where('guard_name', config('auth.defaults.guard', 'web'))
            ->first();

        if ($role === null) {
            abort(503, __('Public API role is not configured.'));
        }

        return new ApiAccessData(actor: 'public', role: $role);
    }

    private function resolveFromApiKey(Request $request, string $bearer): ApiAccessData
    {
        $apiKey = $this->apiKeyAuthenticator->authenticate($request, $bearer);

        $limit = $apiKey->rate_limit_per_minute
            ?? (int) config('api.default_rate_limit_per_minute', 60);

        if ($limit > 0) {
            $rateKey = 'api-key:'.$apiKey->id;
            if (RateLimiter::tooManyAttempts($rateKey, $limit)) {
                abort(429, __('API key rate limit exceeded.'));
            }
            RateLimiter::hit($rateKey, 60);
        }

        /** @var Role $role checked by the authenticator */
        $role = $apiKey->role;

        return new ApiAccessData(actor: 'api_key', role: $role, apiKey: $apiKey);
    }
}
