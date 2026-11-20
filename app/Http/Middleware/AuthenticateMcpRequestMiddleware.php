<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Data\Api\ApiAccessData;
use App\Enums\ApiKeyScopeEnum;
use App\Exceptions\MissingPassportKeysException;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use App\Providers\McpOAuthServiceProvider;
use App\Services\Api\ApiKeyAuthenticatorService;
use App\Services\Mcp\McpAccessTokenAuthenticatorService;
use App\Services\Mcp\McpOAuthServerService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Authenticate MCP requests with a Bearer credential holding `mcp:read` (or `mcp:write`, which
 * implies it): an owned API key, or, when OAuth for remote MCP clients is on (#802), an OAuth
 * access token. Write tools additionally need `mcp:write`.
 *
 * Two doors, one decision. A token shaped like an API key (`ext_…`, `ek_…`) is checked by
 * {@see ApiKeyAuthenticatorService}; anything else, with OAuth on, by
 * {@see McpAccessTokenAuthenticatorService}, which resolves the token to its grant row and runs
 * that row through the same checks. Both end here with the same `ApiAccessData`, the same
 * request attributes and the same guard user, so every tool, scope, `collection_slugs`, owner
 * ceiling and write gate downstream decides identically for both. With OAuth off, a non-key
 * token is simply an unknown API key, as before.
 *
 * Ownerless keys are rejected (#215). The key owner's (or grant owner's) permissions are the
 * ceiling.
 *
 * `/mcp` is outside the `web` group and exempt from CSRF, so there is no session login: a
 * session path would let any site drive the tools with a signed-in user's cookies (#441).
 * Failed attempts are limited per IP here, before `throttle:mcp`, which needs the resolved key
 * to apply its per-key limit.
 */
class AuthenticateMcpRequestMiddleware
{
    public function __construct(
        private readonly ApiKeyAuthenticatorService $apiKeyAuthenticator,
        private readonly McpAccessTokenAuthenticatorService $accessTokenAuthenticator,
        private readonly McpOAuthServerService $oauthServer,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $failureKey = 'mcp-auth-failures:'.McpOAuthServiceProvider::clientThrottleKey($request);
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
            return $this->actAs($request, $this->authenticateCredential($request, $bearer), $next);
        } catch (MissingPassportKeysException $exception) {
            RateLimiter::hit($failureKey, 60);

            return response()->json([
                'message' => $exception->getMessage(),
                'error' => 'temporarily_unavailable',
            ], 503);
        } catch (HttpExceptionInterface $exception) {
            if (in_array($exception->getStatusCode(), [401, 403], true)) {
                RateLimiter::hit($failureKey, 60);
            }

            throw $exception;
        }
    }

    /**
     * The API key, or the OAuth grant row, the bearer token acts as.
     *
     * OAuth door only when ready (keys present): `isEnabled()` alone would let league throw when
     * keys are missing. A non-key bearer while OAuth is on but keys are absent answers 503 here
     * so connectors get a clear signal — never `error=invalid_token`.
     */
    private function authenticateCredential(Request $request, string $bearer): ApiKey
    {
        $isApiKeyShaped = ApiKey::publicPrefixOf($bearer) !== null;

        if (! $isApiKeyShaped && $this->oauthServer->isEnabled() && ! $this->oauthServer->hasPassportKeys()) {
            throw MissingPassportKeysException::make();
        }

        if (! $isApiKeyShaped && $this->oauthServer->isReady()) {
            return $this->accessTokenAuthenticator->authenticate($request);
        }

        return $this->apiKeyAuthenticator->authenticate(
            $request,
            $bearer,
            isOwnerRequired: true,
            requiredScope: ApiKeyScopeEnum::McpRead,
        );
    }

    /**
     * Bind the credential for this request, identically for both doors.
     *
     * @param  Closure(Request): Response  $next
     */
    private function actAs(Request $request, ApiKey $apiKey, Closure $next): Response
    {
        /** @var User $owner checked by the authenticator */
        $owner = $apiKey->owner;
        /** @var Role $role checked by the authenticator */
        $role = $apiKey->role;

        $canWrite = (bool) config('ai.mcp.write_enabled', true)
            && $apiKey->hasScope(ApiKeyScopeEnum::McpWrite);

        // Declared divergence (#781): the owner is set on the default (session) guard for this
        // request only, not on a separate `api-key` guard. Spatie resolves roles and permissions
        // against the default guard's name, so a separate guard would make every permission
        // lookup in the MCP tools fail. No session is started (`/mcp` is outside the `web`
        // group), and a key can never reach key management, which is session-only
        // (ApiKeyManagementTest). Do not "fix" this into a registered guard.
        Auth::guard(config('auth.defaults.guard', 'web'))->setUser($owner);
        Auth::shouldUse(config('auth.defaults.guard', 'web'));

        $access = new ApiAccessData(actor: $apiKey->isOAuthGrant() ? 'oauth' : 'api_key', role: $role, apiKey: $apiKey);
        app()->instance(ApiAccessData::class, $access);

        $request->attributes->set('apiAccess', $access);
        $request->attributes->set('mcp_api_key', $apiKey);
        $request->attributes->set('mcp_can_write', $canWrite);

        return $next($request);
    }
}
