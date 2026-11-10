<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\ApiKeyScopeEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\User;
use App\Support\Api\ApiAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticate MCP requests via owned API key (mcp:read) or session user.
 *
 * Ownerless keys are rejected (#215). The key owner's permissions are the ceiling.
 */
class AuthenticateMcpRequestMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $bearer = $request->bearerToken();

        if ($bearer !== null && $bearer !== '') {
            return $this->authenticateApiKey($request, $bearer, $next);
        }

        $user = $request->user();

        if ($user instanceof User && $user->is_active && ! $user->trashed()) {
            $request->attributes->set('mcp_can_write', (bool) config('ai.mcp.write_enabled', false));
            $request->attributes->set('mcp_api_key', null);

            return $next($request);
        }

        abort(401, 'MCP authentication required.');
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
