<?php

namespace App\Ai\Support;

final class SafeRemoteUrl
{
    /**
     * Validate that a URL is safe to fetch server-side (SSRF protection).
     * Returns null when safe, or an Italian error message when blocked.
     */
    public static function validate(string $url): ?string
    {
        $trimmed = trim($url);

        if ($trimmed === '') {
            return 'Error: Serve url.';
        }

        if (strlen($trimmed) > 2048) {
            return 'Error: URL troppo lunga.';
        }

        $parts = parse_url($trimmed);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return 'Error: URL non valida.';
        }

        $scheme = strtolower($parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            return 'Error: Solo URL http/https sono consentite.';
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return 'Error: Credenziali nell\'URL non consentite.';
        }

        $host = strtolower($parts['host']);
        $host = trim($host, '[]');

        if ($host === '' || self::isBlockedHostname($host)) {
            return 'Error: Host non consentito (SSRF).';
        }

        $allowedHosts = array_values(array_filter(array_map(
            fn (mixed $allowedHost): string => strtolower(trim((string) $allowedHost)),
            (array) config('ai.remote_import_hosts', []),
        )));

        if ($allowedHosts !== [] && ! in_array($host, $allowedHosts, true)) {
            return 'Error: Host non presente nella allowlist degli import remoti.';
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (self::isBlockedIp($host)) {
                return 'Error: Indirizzo IP non consentito (SSRF).';
            }

            return null;
        }

        $resolvedIps = self::resolveHostIps($host);

        if ($resolvedIps === []) {
            return 'Error: Impossibile risolvere l\'host.';
        }

        foreach ($resolvedIps as $ip) {
            if (self::isBlockedIp($ip)) {
                return 'Error: L\'host risolve a un indirizzo non consentito (SSRF).';
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
