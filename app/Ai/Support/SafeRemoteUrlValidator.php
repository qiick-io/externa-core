<?php

namespace App\Ai\Support;

/**
 * SSRF-safe validation for remote import URLs.
 */
final class SafeRemoteUrlValidator
{
    /**
     * Validate that a URL is safe to fetch server-side (SSRF protection).
     * Returns null when safe, or an English error message when blocked.
     */
    public static function validate(string $url): ?string
    {
        $trimmed = trim($url);

        if ($trimmed === '') {
            return 'Error: url is required.';
        }

        if (strlen($trimmed) > 2048) {
            return 'Error: URL is too long.';
        }

        $parts = parse_url($trimmed);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return 'Error: Invalid URL.';
        }

        $scheme = strtolower($parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            return 'Error: Only http/https URLs are allowed.';
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return 'Error: Credentials in the URL are not allowed.';
        }

        $host = strtolower($parts['host']);
        $host = trim($host, '[]');

        if ($host === '' || self::isBlockedHostname($host)) {
            return 'Error: Host not allowed (SSRF).';
        }

        $allowedHosts = array_values(array_filter(array_map(
            fn (mixed $allowedHost): string => strtolower(trim((string) $allowedHost)),
            (array) config('ai.remote_import_hosts', []),
        )));

        if ($allowedHosts !== [] && ! in_array($host, $allowedHosts, true)) {
            return 'Error: Host is not on the remote import allowlist.';
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (self::isBlockedIp($host)) {
                return 'Error: IP address not allowed (SSRF).';
            }

            return null;
        }

        $resolvedIps = self::resolveHostIps($host);

        if ($resolvedIps === []) {
            return 'Error: Unable to resolve host.';
        }

        foreach ($resolvedIps as $ip) {
            if (self::isBlockedIp($ip)) {
                return 'Error: Host resolves to a disallowed address (SSRF).';
            }
        }

        return null;
    }

    private static function isBlockedHostname(string $host): bool
    {
        if (in_array($host, ['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal'], true)) {
            return true;
        }

        if (str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            return true;
        }

        return false;
    }

    private static function isBlockedIp(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return true;
        }

        // Blocks private + reserved (loopback, link-local, etc.)
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) === false;
    }

    /**
     * @return list<string>
     */
    private static function resolveHostIps(string $host): array
    {
        $ips = [];

        $records = @dns_get_record($host, DNS_A + DNS_AAAA);

        if (is_array($records)) {
            foreach ($records as $record) {
                if (isset($record['ip']) && is_string($record['ip'])) {
                    $ips[] = $record['ip'];
                }

                if (isset($record['ipv6']) && is_string($record['ipv6'])) {
                    $ips[] = $record['ipv6'];
                }
            }
        }

        if ($ips === []) {
            $fallback = @gethostbynamel($host);

            if (is_array($fallback)) {
                $ips = array_values(array_filter($fallback, fn ($ip) => is_string($ip)));
            }
        }

        return array_values(array_unique($ips));
    }
}
