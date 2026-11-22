<?php

declare(strict_types=1);

namespace App\Services\Mcp;

use App\Models\OAuthBlockedRedirectHost;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Passport\Client;
use League\Uri\UriString;
use Throwable;

/**
 * Redirect URI and blocked-host rules for MCP OAuth (#815): exact match, no fragments,
 * dangerous schemes denylisted even when listed in custom schemes, and blocked hosts that
 * match the registered host or any subdomain.
 *
 * Registered redirect hosts must already be ASCII (punycode for IDN). Unicode spellings
 * (fullwidth letters, combining accents, …) are refused: `parse_url` corrupts high bytes and
 * `idn_to_ascii` can emit `'?'` instead of failing. Hosts are parsed with League Uri, never
 * `parse_url`. The admin block form still accepts Unicode and stores the ASCII form.
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

        try {
            $parts = UriString::parse($redirectUri);
        } catch (Throwable) {
            return false;
        }

        $scheme = $parts['scheme'] ?? null;

        if (! is_string($scheme) || $scheme === '') {
            return false;
        }

        if (in_array(Str::lower($scheme), self::DANGEROUS_SCHEMES, true)) {
            return false;
        }

        $rawHost = $parts['host'] ?? null;

        if (! is_string($rawHost) || $rawHost === '') {
            return true;
        }

        try {
            $this->assertRedirectHostIsAscii($rawHost);
            $this->normalizeHost($this->unwrapIpv6Host($rawHost));
        } catch (InvalidArgumentException) {
            return false;
        }

        return true;
    }

    /**
     * Normalise a host for storage and comparison: lower case, no trailing dots, IDN to ASCII
     * (UTS #46 / IDNA2008, nontransitional, STD3). IP literals (RFC 8252 loopback included) skip
     * IDNA — `idn_to_ascii('::1')` fails and would wrongly refuse `http://[::1]:…`. Throws when
     * conversion fails or reports errors.
     *
     * @throws InvalidArgumentException
     */
    public function normalizeHost(string $host): string
    {
        $normalizedHost = Str::lower(rtrim(trim($this->unwrapIpv6Host($host)), '.'));

        if ($normalizedHost === '') {
            throw new InvalidArgumentException('Host is empty.');
        }

        if (filter_var($normalizedHost, FILTER_VALIDATE_IP) !== false) {
            return $normalizedHost;
        }

        $idnaInfo = [];
        $asciiHost = idn_to_ascii(
            $normalizedHost,
            IDNA_DEFAULT | IDNA_NONTRANSITIONAL_TO_ASCII | IDNA_USE_STD3_RULES,
            INTL_IDNA_VARIANT_UTS46,
            $idnaInfo,
        );

        if (
            $asciiHost === false
            || $asciiHost === ''
            || str_contains($asciiHost, '?')
            || (($idnaInfo['errors'] ?? 0) !== 0)
        ) {
            throw new InvalidArgumentException('Host is not a valid internationalised domain name.');
        }

        return Str::lower($asciiHost);
    }

    /**
     * Host of a redirect URI, or null when the URI has none (private-use schemes).
     * Non-ASCII hosts are refused: clients must register the punycode form.
     *
     * @throws InvalidArgumentException when the host is non-ASCII or fails IDN conversion
     */
    public function hostOf(string $redirectUri): ?string
    {
        try {
            $parts = UriString::parse($redirectUri);
        } catch (Throwable $exception) {
            throw new InvalidArgumentException('Redirect URI could not be parsed.', 0, $exception);
        }

        $rawHost = $parts['host'] ?? null;

        if (! is_string($rawHost) || $rawHost === '') {
            return null;
        }

        $this->assertRedirectHostIsAscii($rawHost);

        return $this->normalizeHost($rawHost);
    }

    /**
     * Whether `$host` is blocked: exact match or a subdomain of a blocked host.
     * A host that fails normalisation is treated as blocked (fail closed).
     */
    public function isHostBlocked(string $host): bool
    {
        try {
            $normalizedHost = $this->normalizeHost($host);
        } catch (InvalidArgumentException) {
            return true;
        }

        foreach (OAuthBlockedRedirectHost::query()->pluck('host') as $blockedHost) {
            if (! is_string($blockedHost) || $blockedHost === '') {
                continue;
            }

            try {
                $normalizedBlocked = $this->normalizeHost($blockedHost);
            } catch (InvalidArgumentException) {
                continue;
            }

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
     * Whether any of the client's redirect URIs resolve to a blocked host, or use a non-ASCII
     * host that registration would refuse.
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

            try {
                $host = $this->hostOf($redirectUri);
            } catch (InvalidArgumentException) {
                return true;
            }

            if ($host !== null && $this->isHostBlocked($host)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Raw host from a redirect URI via League Uri (no `parse_url`), or null when absent.
     */
    public function rawHostOf(string $redirectUri): ?string
    {
        try {
            $parts = UriString::parse($redirectUri);
        } catch (Throwable) {
            return null;
        }

        $rawHost = $parts['host'] ?? null;

        if (! is_string($rawHost) || $rawHost === '') {
            return null;
        }

        return $this->unwrapIpv6Host($rawHost);
    }

    /**
     * Redirect hosts on the wire must already be ASCII; IDN clients register the punycode form.
     *
     * @throws InvalidArgumentException
     */
    private function assertRedirectHostIsAscii(string $host): void
    {
        $candidate = $this->unwrapIpv6Host($host);

        if (preg_match('/[^\x00-\x7F]/', $candidate) === 1) {
            throw new InvalidArgumentException('Redirect host must be ASCII; register the punycode form for an IDN.');
        }
    }

    /**
     * Strip brackets from an IPv6 literal host (`[::1]` → `::1`).
     */
    private function unwrapIpv6Host(string $host): string
    {
        if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
            return substr($host, 1, -1);
        }

        return $host;
    }
}
