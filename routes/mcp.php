<?php

declare(strict_types=1);

/**
 * Optional first-party MCP streamable HTTP endpoint (#121), and OAuth for remote MCP clients
 * (#802 / #815).
 *
 * `/mcp` is disabled by default (`AI_MCP_ENABLED`). Auth: an owned API key with `mcp:read`, or,
 * when `AI_MCP_OAUTH_ENABLED` is on, an OAuth access token for this endpoint (Bearer); failed
 * attempts are limited per IP in the auth middleware. laravel/mcp's `WWW-Authenticate` middleware
 * is replaced by {@see AddMcpAuthenticateChallengeMiddleware}, which keeps the RFC 6750 error
 * code and adds the RFC 9728 metadata link when OAuth is on.
 *
 * The OAuth routes answer 404 until OAuth is on ({@see EnsureMcpOAuthEnabledMiddleware}), and
 * answer a clear 503 when OAuth is on but Passport keys are missing (fail closed, never 500):
 *
 * - discovery and dynamic registration: {@see Mcp::oauthRoutes()} (RFC 9728 / RFC 8414 /
 *   RFC 7591), with registration replaced by {@see RegisterMcpClientController} for governance
 *   the package cannot express (global cap, blocked hosts, https/loopback-only redirects);
 * - `GET|POST|DELETE /oauth/authorize`: Passport's authorization endpoint and the consent
 *   screen (session, CSRF, two-factor enforcement: the `web` group);
 * - `POST /oauth/token`: Passport's token endpoint (authorization code and refresh token only).
 *
 * Wire scope is laravel/mcp's `mcp:use`. Consent maps that to a narrowed grant (role, API-key
 * scopes, collections) stored as an `api_keys` row; both doors share the same authorizer.
 */

use App\Http\Controllers\Mcp\ApproveMcpClientController;
use App\Http\Controllers\Mcp\AuthorizeMcpClientController;
use App\Http\Controllers\Mcp\DenyMcpClientController;
use App\Http\Controllers\Mcp\RegisterMcpClientController;
use App\Http\Middleware\AddMcpAuthenticateChallengeMiddleware;
use App\Http\Middleware\AuthenticateMcpRequestMiddleware;
use App\Http\Middleware\EnsureMcpEnabledMiddleware;
use App\Http\Middleware\EnsureMcpOAuthEnabledMiddleware;
use App\Http\Middleware\ValidateMcpOAuthAuthorizationRequestMiddleware;
use App\Http\Middleware\ValidateMcpOAuthTokenRequestMiddleware;
use App\Mcp\Servers\ExternaServer;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Facades\Mcp;
use Laravel\Mcp\Server\Middleware\AddAuthorizationFramingHeaders;
use Laravel\Mcp\Server\Middleware\AddWwwAuthenticateHeader;
use Laravel\Mcp\Server\Registrar;
use Laravel\Passport\Http\Controllers\AccessTokenController;

Mcp::web('/mcp', ExternaServer::class)
    ->withoutMiddleware(AddWwwAuthenticateHeader::class)
    ->middleware([
        EnsureMcpEnabledMiddleware::class,
        AddMcpAuthenticateChallengeMiddleware::class,
        // Auth before throttle so the mcp limiter can key by API key / user.
        AuthenticateMcpRequestMiddleware::class,
        'throttle:mcp',
    ])
    ->name('mcp');

Route::middleware(EnsureMcpOAuthEnabledMiddleware::class)->group(function (): void {
    // Every advertised URL comes from config('app.url'), never the request Host. Register
    // root and nested discovery before Mcp::oauthRoutes() so laravel/mcp's url('/') documents
    // are shadowed (first match wins).
    $metadata = static function (?string $path = null): JsonResponse {
        $oauthServer = app(McpOAuthServerService::class);
        $issuer = $oauthServer->issuer();
        $resourcePath = is_string($path) && $path !== '' ? '/'.ltrim($path, '/') : '';

        return response()->json([
            'resource' => $issuer.$resourcePath,
            'authorization_servers' => [config('mcp.authorization_server') ?? $issuer],
            'scopes_supported' => [Registrar::OAUTH_SCOPE],
        ]);
    };

    $authorizationServerMetadata = static function (): JsonResponse {
        $issuer = app(McpOAuthServerService::class)->issuer();

        return response()->json(array_filter([
            'issuer' => config('mcp.authorization_server') ?? $issuer,
            'authorization_endpoint' => $issuer.'/oauth/authorize',
            'token_endpoint' => $issuer.'/oauth/token',
            'registration_endpoint' => $issuer.'/oauth/register',
            'response_types_supported' => ['code'],
            'code_challenge_methods_supported' => ['S256'],
            'scopes_supported' => [Registrar::OAUTH_SCOPE],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'token_endpoint_auth_methods_supported' => ['none', 'client_secret_basic', 'client_secret_post'],
        ]));
    };

    // Exact documents first so laravel/mcp skips them (hasGetRoute). Nested documents must be
    // registered after oauthRoutes(): a second Route::get for the same URI replaces the package
    // handlers that still build URLs from the request Host via url('/').
    Route::get('.well-known/oauth-protected-resource', static fn (): JsonResponse => $metadata('mcp'))
        ->name('mcp.oauth.protected-resource');

    Route::get('.well-known/oauth-authorization-server', $authorizationServerMetadata)
        ->name('mcp.oauth.authorization-server');

    Mcp::oauthRoutes(registration: false);

    Route::get('.well-known/oauth-protected-resource/{path}', static function (string $path) use ($metadata): JsonResponse {
        return $metadata($path);
    })->where('path', '.*')->name('mcp.oauth.protected-resource.nested');

    Route::get('.well-known/oauth-authorization-server/{path}', static fn () => $authorizationServerMetadata())
        ->where('path', '.*')->name('mcp.oauth.authorization-server.nested');

    Route::post('oauth/register', RegisterMcpClientController::class)
        ->middleware('throttle:mcp-oauth-register')
        ->name('mcp.oauth.register');

    Route::post('oauth/token', [AccessTokenController::class, 'issueToken'])
        ->middleware(['throttle:mcp-oauth-token', ValidateMcpOAuthTokenRequestMiddleware::class])
        ->name('passport.token');

    Route::middleware(['web', AddAuthorizationFramingHeaders::class])->group(function (): void {
        Route::get('oauth/authorize', [AuthorizeMcpClientController::class, 'authorize'])
            ->middleware(ValidateMcpOAuthAuthorizationRequestMiddleware::class)
            ->name('passport.authorizations.authorize');

        Route::middleware(['auth', 'verified'])->group(function (): void {
            Route::post('oauth/authorize', ApproveMcpClientController::class)
                ->name('passport.authorizations.approve');
            Route::delete('oauth/authorize', DenyMcpClientController::class)
                ->name('passport.authorizations.deny');
        });
    });
});
