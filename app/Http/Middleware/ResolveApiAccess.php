<?php

namespace App\Http\Middleware;

use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Support\Api\ApiAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolve public vs API-key actor for /api/v1 and bind ApiAccess on the container.
 */
class ResolveApiAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $bearer = $request->bearerToken();

        if ($bearer !== null && $bearer !== '') {
            $access = $this->resolveFromApiKey($request, $bearer);
        } else {
            $access = $this->resolvePublic();
        }

        app()->instance(ApiAccess::class, $access);
        $request->attributes->set('apiAccess', $access);

        return $next($request);
    }

    private function resolvePublic(): ApiAccess
    {
        $role = Role::query()
            ->where('name', RoleEnum::Public->value)
            ->where('guard_name', config('auth.defaults.guard', 'web'))
            ->first();

        if ($role === null) {
            abort(503, 'Public API role is not configured.');
        }

        return new ApiAccess(actor: 'public', role: $role);
    }

    private function resolveFromApiKey(Request $request, string $bearer): ApiAccess
    {
        $hash = ApiKey::hashSecret($bearer);
        $apiKey = ApiKey::query()->with('role')->where('key_hash', $hash)->first();

        if ($apiKey === null || ! $apiKey->isActive()) {
            abort(401, 'Invalid or inactive API key.');
        }

        if (! $apiKey->allowsIp((string) $request->ip())) {
            abort(401, 'API key is not allowed from this IP address.');
        }

        $limit = $apiKey->rate_limit_per_minute
            ?? (int) config('api.default_rate_limit_per_minute', 60);

        if ($limit > 0) {
            $rateKey = 'api-key:'.$apiKey->id;
            if (RateLimiter::tooManyAttempts($rateKey, $limit)) {
                abort(429, 'API key rate limit exceeded.');
            }
            RateLimiter::hit($rateKey, 60);
        }

        $apiKey->forceFill(['last_used_at' => now()])->saveQuietly();

        $role = $apiKey->role;
        if ($role === null) {
            abort(401, 'API key role is missing.');
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            abort(401, 'API keys cannot use the super-admin role.');
        }

        return new ApiAccess(actor: 'api_key', role: $role, apiKey: $apiKey);
    }
}
