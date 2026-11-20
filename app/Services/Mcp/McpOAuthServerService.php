<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use DateInterval;
use Laravel\Mcp\Server\Registrar;
use Laravel\Passport\Passport;

/**
 * Whether Externa is the authorization server of its own MCP endpoint (#802 / #815), and the
 * resource identifier tokens are issued for.
 *
 * Discovery documents and dynamic registration come from {@see Registrar::oauthRoutes()} /
 * laravel/mcp (`mcp:use` on the wire). Consent maps that wire scope to a narrowed grant
 * (role, API-key scopes, collections) stored as an `api_keys` row; this service does not
 * republish scope vocabularies.
 *
 * - The issuer is the app URL and the resource is `{APP_URL}/mcp`, both without a trailing slash
 *   (RFC 8414 §2, RFC 8707 §2).
 * - Clients register themselves as public clients and prove possession with PKCE (S256 only).
 *   Only the authorization code and refresh token grants are accepted at the token endpoint.
 * - Missing Passport keys fail closed: OAuth can be configured on, but endpoints refuse with a
 *   clear error until keys exist (never a 500 from league/oauth2-server).
 */
final class McpOAuthServerService
{
    /** The MCP endpoint path, relative to the app URL. */
    public const string MCP_PATH = 'mcp';

    /** Wire scope advertised by laravel/mcp and stored on Passport tokens. */
    public const string WIRE_SCOPE = Registrar::OAUTH_SCOPE;

    /** @var list<string> */
    public const array SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];

    /** @var list<string> */
    public const array SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'];

    /**
     * Whether OAuth for remote MCP clients is configured on. It needs the MCP endpoint itself:
     * OAuth on with MCP off serves nothing. Keys are checked separately ({@see hasPassportKeys()}).
     */
    public function isEnabled(): bool
    {
        return (bool) config('ai.mcp.enabled', false) && (bool) config('ai.mcp.oauth.enabled', false);
    }

    /**
     * Whether Passport can sign and verify tokens. Env PEM wins over files in `storage/`.
     * A half-set env pair (only one of private/public) is treated as missing; key files must
     * exist and be readable.
     */
    public function hasPassportKeys(): bool
    {
        $privateKey = config('passport.private_key');
        $publicKey = config('passport.public_key');
        $hasPrivateEnv = is_string($privateKey) && $privateKey !== '';
        $hasPublicEnv = is_string($publicKey) && $publicKey !== '';

        if ($hasPrivateEnv || $hasPublicEnv) {
            return $hasPrivateEnv && $hasPublicEnv;
        }

        $privatePath = Passport::keyPath('oauth-private.key');
        $publicPath = Passport::keyPath('oauth-public.key');

        return is_readable($privatePath) && is_readable($publicPath);
    }

    /**
     * Configured on and able to serve: missing keys keep routes from minting tokens.
     */
    public function isReady(): bool
    {
        return $this->isEnabled() && $this->hasPassportKeys();
    }

    /**
     * RFC 8414 issuer identifier: `config('app.url')`, never the request Host header.
     */
    public function issuer(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    /**
     * RFC 8707 resource identifier of the MCP endpoint: the audience every access token is issued
     * for and checked against on every call.
     */
    public function resourceIdentifier(): string
    {
        return $this->issuer().'/'.self::MCP_PATH;
    }

    /**
     * Whether an RFC 8707 `resource` parameter names the MCP endpoint. Absent or non-string
     * values are refused (`invalid_target`): clients must send the audience explicitly.
     */
    public function acceptsResource(mixed $resource): bool
    {
        return is_string($resource) && rtrim($resource, '/') === $this->resourceIdentifier();
    }

    /**
     * Where the RFC 9728 metadata of the MCP endpoint lives: the well-known prefix inserted before
     * the resource path, as clients derive it from the resource identifier.
     */
    public function protectedResourceMetadataUrl(): string
    {
        return $this->issuer().'/.well-known/oauth-protected-resource/'.self::MCP_PATH;
    }

    /**
     * What Passport accepts as an OAuth scope string: only laravel/mcp's `mcp:use`. The consent
     * screen maps that to API-key scopes on the grant row.
     *
     * @return array<string, string>
     */
    public function scopeDescriptions(): array
    {
        return [
            self::WIRE_SCOPE => 'Use the MCP server with the access the user grants',
        ];
    }

    /**
     * The access token lifetime. Short on purpose: revocation also takes effect at once, but a
     * leaked token should not outlive a working day.
     */
    public function accessTokenLifetime(): DateInterval
    {
        return new DateInterval(sprintf('PT%dM', max(1, (int) config('ai.mcp.oauth.access_token_ttl_minutes', 60))));
    }

    public function refreshTokenLifetime(): DateInterval
    {
        return new DateInterval(sprintf('P%dD', max(1, (int) config('ai.mcp.oauth.refresh_token_ttl_days', 30))));
    }

    /**
     * Hours after registration a client with no successful authorisation is pruned.
     */
    public function unusedClientRetentionHours(): int
    {
        return max(1, (int) config('ai.mcp.oauth.unused_client_retention_hours', 24));
    }

    /**
     * Soft global cap on registered (not revoked) OAuth clients.
     */
    public function registrationGlobalCap(): int
    {
        return max(1, (int) config('ai.mcp.oauth.registrations_global_cap', 10_000));
    }
}
