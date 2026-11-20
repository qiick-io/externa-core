<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Laravel\Mcp\Server\Http\Controllers\OAuthRegisterController;
use Laravel\Passport\Client;

/**
 * RFC 7591 dynamic client registration for remote MCP clients (#802 / #815).
 *
 * Kept instead of laravel/mcp's bare `OAuthRegisterController` route because the package cannot
 * express this install's governance (decision 2026-11-20):
 *
 * - per-IP rate limit (route middleware) plus a soft global cap on non-revoked clients;
 * - redirect hosts blocked by an admin;
 * - redirect URIs must be `https`, loopback `http`, or a listed private-use scheme (never open
 *   `http` to an arbitrary host even when `mcp.redirect_domains` is `*`);
 * - clear JSON when Passport keys are missing (the group middleware also covers this).
 *
 * Everything else (Passport public client creation, `mcp:use` on the registration response,
 * package redirect-domain / custom-scheme checks) stays in the parent.
 */
class RegisterMcpClientController extends OAuthRegisterController
{
    public function __invoke(Request $request): JsonResponse
    {
        $oauthServer = app(McpOAuthServerService::class);

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

                $host = $this->redirectHost($redirectUri);

                if ($host !== null && OAuthBlockedRedirectHost::query()->where('host', $host)->exists()) {
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
     * parent's custom-scheme allowlist.
     */
    protected function isValidRedirectUri(string $value): bool
    {
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

    private function redirectHost(string $redirectUri): ?string
    {
        $host = parse_url($redirectUri, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return null;
        }

        return Str::lower($host);
    }
}
