<?php

namespace App\Ai\Support;

use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * SSRF-safe validation for remote import / outbound URLs.
 */
final class SafeRemoteUrlValidator
{
    /**
     * Explicit denylist beyond FILTER_FLAG_NO_PRIV_RANGE|NO_RES_RANGE
     * (CGNAT, docs ranges, extra IPv6 ULA/link-local).
     *
     * @var list<string>
     */
    private const BLOCKED_CIDRS = [
        '0.0.0.0/8',
        '10.0.0.0/8',
        '100.64.0.0/10', // CGNAT (incl. Alibaba metadata 100.100.100.200)
        '127.0.0.0/8',
        '169.254.0.0/16',
        '172.16.0.0/12',
        '192.0.0.0/24',
        '192.0.2.0/24',
        '192.168.0.0/16',
        '198.18.0.0/15',
        '198.51.100.0/24',
        '203.0.113.0/24',
        '224.0.0.0/4',
        '240.0.0.0/4',
        '::/128',
        '::1/128',
        'fc00::/7',
        'fe80::/10',
        'ff00::/8',
        '2001:db8::/32',
    ];

    private const GENERIC_HOST_BLOCKED = 'Error: Host not allowed (SSRF).';

    private const GENERIC_IP_BLOCKED = 'Error: IP address not allowed (SSRF).';

    private const GENERIC_RESOLVE_BLOCKED = 'Error: Host resolves to a disallowed address (SSRF).';

    /**
     * Validate that a URL is safe to fetch server-side (SSRF protection).
     * Returns null when safe, or a generic English error when blocked.
     * Details go to the log only (no port-scan oracle in user messages).
     *
     * @param  bool  $allowPrivateHosts  When true, skip private/reserved IP checks (webhooks / OIDC opt-in).
     * @param  bool  $enforceHostAllowlist  When true, apply `ai.remote_import_hosts` if configured.
     */
    public static function validate(
        string $url,
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
    ): ?string {
        return self::inspect($url, $allowPrivateHosts, $enforceHostAllowlist)['error'];
    }

    /**
     * Validate and resolve pinned IPs for the subsequent request.
     *
     * @return array{
     *     error: ?string,
     *     url: string,
     *     host: ?string,
     *     port: ?int,
     *     ips: list<string>
     * }
     */
    public static function inspect(
        string $url,
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
    ): array {
        $empty = ['error' => null, 'url' => trim($url), 'host' => null, 'port' => null, 'ips' => []];
        $trimmed = trim($url);

        if ($trimmed === '') {
            return [...$empty, 'error' => 'Error: url is required.'];
        }

        if (strlen($trimmed) > 2048) {
            return [...$empty, 'error' => 'Error: URL is too long.'];
        }

        $parts = parse_url($trimmed);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return [...$empty, 'error' => 'Error: Invalid URL.'];
        }

        $scheme = strtolower($parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            return [...$empty, 'error' => 'Error: Only http/https URLs are allowed.'];
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return [...$empty, 'error' => 'Error: Credentials in the URL are not allowed.'];
        }

        $host = strtolower($parts['host']);
        $host = trim($host, '[]');

        if ($host === '') {
            return [...$empty, 'error' => self::GENERIC_HOST_BLOCKED];
        }

        $port = isset($parts['port']) && is_int($parts['port'])
            ? $parts['port']
            : ($scheme === 'https' ? 443 : 80);

        // Cloud metadata hostnames are never allowed, even with private-host opt-in.
        if (in_array($host, ['metadata', 'metadata.google.internal'], true)) {
            self::logBlock($trimmed, 'metadata hostname', $host);

            return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => self::GENERIC_HOST_BLOCKED];
        }

        if (! $allowPrivateHosts && self::isBlockedHostname($host)) {
            self::logBlock($trimmed, 'blocked hostname', $host);

            return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => self::GENERIC_HOST_BLOCKED];
        }

        if ($enforceHostAllowlist) {
            $allowedHosts = array_values(array_filter(array_map(
                fn (mixed $allowedHost): string => strtolower(trim((string) $allowedHost)),
                (array) config('ai.remote_import_hosts', []),
            )));

            if ($allowedHosts !== [] && ! in_array($host, $allowedHosts, true)) {
                return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => 'Error: Host is not on the remote import allowlist.'];
            }
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (! $allowPrivateHosts && self::isBlockedIp($host)) {
                self::logBlock($trimmed, 'literal blocked IP', $host);

                return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => self::GENERIC_IP_BLOCKED];
            }

            return ['error' => null, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => [$host]];
        }

        // Feature: Http::fake hosts (e.g. idp.example.com) often have no DNS — skip resolve so
        // feature tests can stub discovery/import without hitting the network.
        if (app()->runningUnitTests()) {
            return ['error' => null, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => []];
        }

        $resolvedIps = self::resolveHostIps($host);

        if ($resolvedIps === []) {
            return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => 'Error: Unable to resolve host.'];
        }

        if ($allowPrivateHosts) {
            return ['error' => null, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => $resolvedIps];
        }

        foreach ($resolvedIps as $ip) {
            if (self::isBlockedIp($ip)) {
                self::logBlock($trimmed, 'resolved blocked IP', $host, $ip);

                return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => $resolvedIps, 'error' => self::GENERIC_RESOLVE_BLOCKED];
            }
        }

        return ['error' => null, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => $resolvedIps];
    }

    /**
     * Outbound webhook / Slack notifier URLs: SSRF checks without the AI import host allowlist.
     */
    public static function validateOutboundWebhook(string $url): ?string
    {
        return self::validate(
            $url,
            allowPrivateHosts: (bool) config('webhooks.allow_private_hosts', false),
            enforceHostAllowlist: false,
        );
    }

    /**
     * OIDC discovery / token / userinfo URLs (opt-in private IdPs).
     */
    public static function validateOidcEndpoint(string $url): ?string
    {
        return self::validate(
            $url,
            allowPrivateHosts: (bool) config('services.oidc.allow_private_hosts', false),
            enforceHostAllowlist: false,
        );
    }

    /**
     * Curl CURLOPT_RESOLVE entries pinning host:port to the first validated IP.
     *
     * @param  list<string>  $ips
     * @return list<string>
     */
    public static function curlResolveEntries(string $host, int $port, array $ips): array
    {
        if ($ips === []) {
            return [];
        }

        $ip = $ips[0];

        return [sprintf('%s:%d:%s', $host, $port, $ip)];
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

        if (IpUtils::checkIp($ip, self::BLOCKED_CIDRS)) {
            return true;
        }

        // Belt-and-braces: PHP filter reserved/private flags.
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

    private static function logBlock(string $url, string $reason, string $host, ?string $ip = null): void
    {
        Log::warning('SafeRemoteUrlValidator blocked URL', [
            'reason' => $reason,
            'host' => $host,
            'ip' => $ip,
            // Avoid logging full query strings with secrets.
            'url_host' => parse_url($url, PHP_URL_HOST),
        ]);
    }
}
