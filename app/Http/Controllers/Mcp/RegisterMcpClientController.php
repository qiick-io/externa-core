<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mcp;

use App\Services\Mcp\McpOAuthRedirectUriService;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Mcp\Server\Http\Controllers\OAuthRegisterController;
use Laravel\Passport\Client;

/**
 * RFC 7591 dynamic client registration for remote MCP clients (#802 / #815).
 *
 * Kept instead of laravel/mcp's bare `OAuthRegisterController` route because the package cannot
 * express this install's governance (decision 2026-11-20):
 *
 * - per-IP rate limit (route middleware; IPv6 keyed by /64) plus a soft global cap;
 * - redirect hosts blocked by an admin (exact host or subdomain);
 * - no URI fragments; dangerous schemes denylisted even when listed in custom schemes;
 * - redirect URIs must be `https`, loopback `http`, or a listed private-use scheme;
 * - clear JSON when Passport keys are missing.
 */
class RegisterMcpClientController extends OAuthRegisterController
{
    public function __invoke(Request $request): JsonResponse
    {
        $oauthServer = app(McpOAuthServerService::class);
        $redirectUriService = app(McpOAuthRedirectUriService::class);

        if (! $oauthServer->hasPassportKeys()) {
            return response()->json([
                'error' => 'temporarily_unavailable',
                'error_description' => 'OAuth signing keys are missing.',
            ], 503);
        }

        if (Client::query()->where('revoked', false)->count() >= $oauthServer->registrationGlobalCap()) {
            return response()->json([
                'error' => 'temporarily_unavailable',
                'error_description' => 'The maximum number of OAuth clients has been reached.',
            ], 503);
        }

        $redirectUris = $request->input('redirect_uris');

        if (is_array($redirectUris)) {
            foreach ($redirectUris as $redirectUri) {
                if (! is_string($redirectUri)) {
                    continue;
                }

                if (! $redirectUriService->isAcceptableForRegistration($redirectUri)) {
                    return response()->json([
                        'error' => 'invalid_redirect_uri',
                        'error_description' => 'The redirect URI is not allowed on this server.',
                    ], 400);
                }

                $host = $redirectUriService->hostOf($redirectUri);

                if ($host !== null && $redirectUriService->isHostBlocked($host)) {
                    return response()->json([
                        'error' => 'invalid_redirect_uri',
                        'error_description' => 'The redirect host is blocked on this server.',
                    ], 400);
                }
            }
        }

        return parent::__invoke($request);
    }

    /**
     * Stricter than the package: `http` only for loopback; non-http(s) still goes through the
     * parent's custom-scheme allowlist, after our fragment / dangerous-scheme gate.
     */
    protected function isValidRedirectUri(string $value): bool
    {
        if (! app(McpOAuthRedirectUriService::class)->isAcceptableForRegistration($value)) {
            return false;
        }

        if (! parent::isValidRedirectUri($value)) {
            return false;
        }

        $scheme = parse_url($value, PHP_URL_SCHEME);

        if (! is_string($scheme)) {
            return false;
        }

        if ($scheme === 'https') {
            return true;
        }

        if ($scheme === 'http') {
            return $this->isLocalhostUrl($value);
        }

        return true;
    }
}
