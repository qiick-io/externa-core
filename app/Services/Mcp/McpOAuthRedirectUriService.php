<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use Illuminate\Support\Str;
use Laravel\Passport\Client;

/**
 * Redirect URI and blocked-host rules for MCP OAuth (#815): exact match, no fragments,
 * dangerous schemes denylisted even when listed in custom schemes, and blocked hosts that
 * match the registered host or any subdomain (trailing dots normalised).
 */
final class McpOAuthRedirectUriService
{
    /** @var list<string> */
    private const array DANGEROUS_SCHEMES = [
        'javascript',
        'data',
        'vbscript',
        'file',
    ];

    /**
     * Whether the URI is acceptable for DCR before the package's own checks.
     */
    public function isAcceptableForRegistration(string $redirectUri): bool
    {
        if (str_contains($redirectUri, '#')) {
            return false;
        }

        $scheme = parse_url($redirectUri, PHP_URL_SCHEME);

        if (! is_string($scheme) || $scheme === '') {
            return false;
        }

        if (in_array(Str::lower($scheme), self::DANGEROUS_SCHEMES, true)) {
            return false;
        }

        return true;
    }

    /**
     * Normalise a host for storage and comparison: lower case, no trailing dots.
     */
    public function normalizeHost(string $host): string
    {
        return Str::lower(rtrim(trim($host), '.'));
    }

    /**
     * Host of a redirect URI, or null when the URI has none (private-use schemes).
     */
    public function hostOf(string $redirectUri): ?string
    {
        $host = parse_url($redirectUri, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return null;
        }

        return $this->normalizeHost($host);
    }

    /**
     * Whether `$host` is blocked: exact match or a subdomain of a blocked host.
     */
    public function isHostBlocked(string $host): bool
    {
        $normalizedHost = $this->normalizeHost($host);

        if ($normalizedHost === '') {
            return false;
        }

        foreach (OAuthBlockedRedirectHost::query()->pluck('host') as $blockedHost) {
            if (! is_string($blockedHost) || $blockedHost === '') {
                continue;
            }

            $normalizedBlocked = $this->normalizeHost($blockedHost);

            if ($normalizedHost === $normalizedBlocked) {
                return true;
            }

            if (str_ends_with($normalizedHost, '.'.$normalizedBlocked)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether any of the client's redirect URIs resolve to a blocked host.
     */
    public function clientHasBlockedRedirectHost(Client $client): bool
    {
        $redirectUris = $client->getAttribute('redirect_uris');

        if (! is_array($redirectUris)) {
            return false;
        }

        foreach ($redirectUris as $redirectUri) {
            if (! is_string($redirectUri)) {
                continue;
            }

            $host = $this->hostOf($redirectUri);

            if ($host !== null && $this->isHostBlocked($host)) {
                return true;
            }
        }

        return false;
    }
}
