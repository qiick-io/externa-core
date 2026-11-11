<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\ApiKeyScopeEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Support\Api\ApiAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Authenticate MCP requests with an owned API key (mcp:read), sent as a Bearer token.
 *
 * Ownerless keys are rejected (#215). The key owner's permissions are the ceiling.
 *
 * `/mcp` is outside the `web` group and exempt from CSRF, so there is no session login: a
 * session path would let any site drive the tools with a signed-in user's cookies (#441).
 * Failed attempts are limited per IP here, before `throttle:mcp`, which needs the resolved key
 * to apply its per-key limit.
 */
class AuthenticateMcpRequestMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $failureKey = 'mcp-auth-failures:'.$request->ip();
        $maxFailures = max(1, (int) config('ai.mcp.auth_failures_per_minute', 20));

        if (RateLimiter::tooManyAttempts($failureKey, $maxFailures)) {
            abort(429, 'Too many failed MCP authentication attempts.');
        }

        $bearer = $request->bearerToken();

        if ($bearer === null || $bearer === '') {
            RateLimiter::hit($failureKey, 60);

            abort(401, 'MCP authentication required.');
        }

        try {
            return $this->authenticateApiKey($request, $bearer, $next);
        } catch (HttpExceptionInterface $exception) {
            if (in_array($exception->getStatusCode(), [401, 403], true)) {
                RateLimiter::hit($failureKey, 60);
            }

            throw $exception;
        }
    }

    /**
     * @param  Closure(Request): Response  $next
     */
    private function authenticateApiKey(Request $request, string $bearer, Closure $next): Response
    {
        $hash = ApiKey::hashSecret($bearer);
        $apiKey = ApiKey::query()->with(['role', 'owner'])->where('key_hash', $hash)->first();

        if ($apiKey === null || ! $apiKey->isActive()) {
            abort(401, 'Invalid or inactive API key.');
        }

        if (! $apiKey->hasOwner()) {
            abort(401, 'MCP requires an API key with an owner.');
        }

        $owner = $apiKey->owner;

        if ($owner === null || ! $owner->is_active || $owner->trashed()) {
            abort(401, 'Invalid or inactive API key owner.');
        }

        if (! $apiKey->allowsIp((string) $request->ip())) {
            abort(401, 'API key is not allowed from this IP address.');
        }

        if (! $apiKey->hasScope(ApiKeyScopeEnum::McpRead)) {
            abort(403, 'API key lacks mcp:read scope.');
        }

        $role = $apiKey->role;

        if ($role === null) {
            abort(401, 'API key role is missing.');
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            abort(401, 'API keys cannot use the super-admin role.');
        }

        $canWrite = (bool) config('ai.mcp.write_enabled', false)
            && $apiKey->hasScope(ApiKeyScopeEnum::McpWrite)
            && ! $apiKey->read_only;

        Auth::guard(config('auth.defaults.guard', 'web'))->setUser($owner);
        Auth::shouldUse(config('auth.defaults.guard', 'web'));

        $access = new ApiAccess(actor: 'api_key', role: $role, apiKey: $apiKey);
        app()->instance(ApiAccess::class, $access);

        $request->attributes->set('apiAccess', $access);
        $request->attributes->set('mcp_api_key', $apiKey);
        $request->attributes->set('mcp_can_write', $canWrite);

        $apiKey->forceFill(['last_used_at' => now()])->saveQuietly();

        return $next($request);
    }
}
