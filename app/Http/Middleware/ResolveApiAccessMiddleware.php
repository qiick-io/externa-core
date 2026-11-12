<?php

namespace App\Http\Middleware;

use App\Data\Api\ApiAccessData;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Role;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolve public vs API-key actor for /api/v1 and bind ApiAccessData on the container.
 */
class ResolveApiAccessMiddleware
{
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
        $hash = ApiKey::hashSecret($bearer);
        $apiKey = ApiKey::query()->with(['role', 'owner'])->where('key_hash', $hash)->first();

        if ($apiKey === null || ! $apiKey->isActive()) {
            abort(401, __('Invalid or inactive API key.'));
        }

        // Owned keys: owner must still be active (lifecycle should have revoked; fail closed).
        if ($apiKey->owner_id !== null) {
            $owner = $apiKey->owner;
            if ($owner === null || ! $owner->is_active || $owner->trashed()) {
                abort(401, __('Invalid or inactive API key.'));
            }
        }

        if (! $apiKey->allowsIp((string) $request->ip())) {
            abort(401, __('API key is not allowed from this IP address.'));
        }

        $limit = $apiKey->rate_limit_per_minute
            ?? (int) config('api.default_rate_limit_per_minute', 60);

        if ($limit > 0) {
            $rateKey = 'api-key:'.$apiKey->id;
            if (RateLimiter::tooManyAttempts($rateKey, $limit)) {
                abort(429, __('API key rate limit exceeded.'));
            }
            RateLimiter::hit($rateKey, 60);
        }

        $apiKey->forceFill(['last_used_at' => now()])->saveQuietly();

        $role = $apiKey->role;
        if ($role === null) {
            abort(401, __('API key role is missing.'));
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            abort(401, __('API keys cannot use the super-admin role.'));
        }

        return new ApiAccessData(actor: 'api_key', role: $role, apiKey: $apiKey);
    }
}
