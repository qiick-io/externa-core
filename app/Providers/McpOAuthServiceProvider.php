<?php

declare(strict_types=1);

namespace App\Providers;

use App\Http\Controllers\Mcp\AuthorizeMcpClientController;
use App\Http\Responses\McpOAuthBearerTokenResponse;
use App\Models\User;
use App\Services\Mcp\McpClientConsentService;
use App\Services\Mcp\McpOAuthRefreshTokenRepositoryService;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;
use Laravel\Passport\Bridge\RefreshTokenRepository as PassportRefreshTokenRepository;
use Laravel\Passport\Client;
use Laravel\Passport\Passport;
use Laravel\Passport\Scope;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Laravel Passport as the authorization server of the MCP endpoint (#802 / #815).
 *
 * Passport is used for its grants, token storage and signing, never for its routes: its route
 * file would expose `/oauth/*` on every install, including the ones that never enable OAuth, and
 * JSON client and token management APIs this app does not offer. The routes are declared in
 * `routes/mcp.php` behind {@see McpOAuthServerService::isEnabled()}.
 *
 * - Wire scope: laravel/mcp's `mcp:use` only ({@see McpOAuthServerService::scopeDescriptions()}).
 *   Consent maps that to a narrowed grant (role, API-key scopes, collections) on an `api_keys` row.
 * - Grants: authorization code with PKCE and refresh tokens (rotated on use, Passport's default).
 *   The token response names the wire `scope` ({@see McpOAuthBearerTokenResponse}).
 *   The device grant is off; the token endpoint refuses client credentials.
 * - Consent view: {@see Passport::authorizationView()} → Inertia `oauth/authorize`.
 * - Every issued access token is bound to its grant row and audience by
 *   {@see BindMcpAccessTokenListener}, which event discovery registers (app/Listeners).
 */
class McpOAuthServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        Passport::ignoreRoutes();
        Passport::$deviceCodeGrantEnabled = false;

        // Passport binds the session guard to its own authorization controller only.
        $this->app->when(AuthorizeMcpClientController::class)
            ->needs(StatefulGuard::class)
            ->give(static fn (): StatefulGuard => Auth::guard(config('passport.guard')));

        // RFC 9700 §4.14.2: reused refresh tokens revoke the whole token family.
        $this->app->bind(PassportRefreshTokenRepository::class, McpOAuthRefreshTokenRepositoryService::class);
    }

    public function boot(McpOAuthServerService $oauthServer): void
    {
        // laravel/mcp falls back to url('/') for issuer when this is null; pin to APP_URL.
        if (config('mcp.authorization_server') === null) {
            config(['mcp.authorization_server' => $oauthServer->issuer()]);
        }

        Passport::tokensCan($oauthServer->scopeDescriptions());
        Passport::setDefaultScope(array_keys($oauthServer->scopeDescriptions()));
        Passport::tokensExpireIn($oauthServer->accessTokenLifetime());
        Passport::refreshTokensExpireIn($oauthServer->refreshTokenLifetime());
        Passport::useAuthorizationServerResponseType(new McpOAuthBearerTokenResponse);

        Passport::authorizationView(static function (array $parameters): SymfonyResponse {
            /** @var Request $request */
            $request = $parameters['request'];
            /** @var User $user */
            $user = $parameters['user'];
            /** @var Client $client */
            $client = $parameters['client'];
            /** @var list<Scope> $scopes */
            $scopes = $parameters['scopes'];

            return Inertia::render('oauth/authorize', app(McpClientConsentService::class)->consentPageProps(
                $request,
                $user,
                $client,
                $scopes,
                (string) $parameters['authToken'],
            ))->toResponse($request);
        });

        RateLimiter::for('mcp-oauth-register', static function (Request $request): Limit {
            return Limit::perMinute(
                max(1, (int) config('ai.mcp.oauth.registrations_per_minute', 10)),
            )->by('mcp-oauth-register:'.self::clientThrottleKey($request));
        });

        RateLimiter::for('mcp-oauth-token', static fn (Request $request): Limit => Limit::perMinute(60)
            ->by('mcp-oauth-token:'.self::clientThrottleKey($request)));
    }

    /**
     * Rate-limit identity for registration, token and MCP auth failures.
     *
     * IPv4: the address. IPv4-mapped (`::ffff:a.b.c.d`), IPv4-compatible (`::a.b.c.d`) and
     * NAT64 well-known (`64:ff9b::/96`) unmap to the embedded IPv4 so dual-stack / translated
     * clients share one budget. Other IPv6: the /64 network prefix.
     */
    public static function clientThrottleKey(Request $request): string
    {
        $ipAddress = $request->ip() ?? 'unknown';
        $packed = @inet_pton($ipAddress);

        if ($packed === false) {
            return $ipAddress;
        }

        if (strlen($packed) === 16) {
            $embeddedIpv4 = self::embeddedIpv4FromMappedOrTranslated($packed);

            if ($embeddedIpv4 !== null) {
                return $embeddedIpv4;
            }

            return 'v6:'.bin2hex(substr($packed, 0, 8));
        }

        return $ipAddress;
    }

    /**
     * Embedded IPv4 from ::ffff:/96, ::/96 (IPv4-compatible) or 64:ff9b::/96 (NAT64), else null.
     */
    private static function embeddedIpv4FromMappedOrTranslated(string $packed): ?string
    {
        $prefix = substr($packed, 0, 12);
        $isIpv4Mapped = $prefix === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff";
        $isIpv4Compatible = $prefix === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00";
        $isNat64WellKnown = $prefix === "\x00\x64\xff\x9b\x00\x00\x00\x00\x00\x00\x00\x00";

        if (! $isIpv4Mapped && ! $isIpv4Compatible && ! $isNat64WellKnown) {
            return null;
        }

        return inet_ntop(substr($packed, 12)) ?: null;
    }
}
