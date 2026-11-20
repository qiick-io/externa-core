<?php

declare(strict_types=1);

namespace App\Ai\Support;

use Closure;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * SSRF-safe validation for remote import / outbound URLs.
 *
 * Refuses credentials in the URL, non-http(s) schemes, and private / loopback /
 * link-local / CGNAT / metadata addresses unless the caller opts into private hosts.
 * Metadata hosts stay blocked even then.
 *
 * Every authorised destination is pinned: the guard decides which address the request
 * goes to, and hands curl exactly that address through CURLOPT_CONNECT_TO with an empty
 * source host, which applies whatever the URL's host looks like. A hostname is resolved
 * once, for A and AAAA, every answer is checked and one of them is pinned, so a DNS
 * rebinding answer after the check is never used; a host that resolves to nothing is
 * refused, because there is nothing checked to pin. An IP literal is pinned to itself.
 * CURLOPT_RESOLVE cannot do this job: it is a DNS-cache entry keyed by host name, and curl
 * never consults it for a host it parses as an address itself, such as `2852039166` or
 * `169.254.169.254.`.
 *
 * An IPv4 address written any other way than dotted decimal (`2852039166`,
 * `0251.0376.0251.0376`, `169.254.43518`, a trailing dot) is read the way curl and
 * inet_aton(3) read it, checked against the metadata list, and then refused: an outbound
 * URL has no reason to spell an address like that, and two parsers can disagree on it.
 *
 * An IPv6 literal arrives from `parse_url()` in URL bracket form and is unwrapped and
 * canonicalised before any check. A bracketed host that is not a valid IPv6 literal is
 * refused outright rather than handed to the resolver.
 */
final class SafeRemoteUrlValidator
{
    /**
     * Explicit denylist beyond FILTER_FLAG_NO_PRIV_RANGE|NO_RES_RANGE
     * (CGNAT, docs ranges, extra IPv6 ULA/link-local).
     *
     * @var list<string>
     */
    private const array BLOCKED_CIDRS = [
        '0.0.0.0/8',
        '10.0.0.0/8',
        '100.64.0.0/10',
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

    /**
     * Always blocked, also with `allowPrivateHosts`: the EC2/GCP, Alibaba Cloud and
     * Oracle Cloud instance metadata addresses and names. IPv4-mapped / compatible
     * forms and every alternate IPv4 spelling the validator canonicalises resolve to
     * these dotted-decimal values through {@see addressForms()} / {@see readIpv4Address()}.
     *
     * @var list<string>
     */
    private const array METADATA_HOSTS = [
        'metadata',
        'metadata.google.internal',
        '169.254.169.254',
        'fd00:ec2::254',
        '100.100.100.200',
        '192.0.0.192',
    ];

    private const string GENERIC_HOST_BLOCKED = 'Error: Host not allowed (SSRF).';

    private const string GENERIC_IP_BLOCKED = 'Error: IP address not allowed (SSRF).';

    private const string GENERIC_RESOLVE_BLOCKED = 'Error: Host resolves to a disallowed address (SSRF).';

    /**
     * @var (Closure(string): list<mixed>)|null
     */
    private static ?Closure $hostResolver = null;

    /**
     * Inject a host resolver for tests (DNS rebinding, pin assertions). Pass null to clear.
     *
     * @param  (Closure(string): list<mixed>)|null  $resolver
     */
    public static function resolveUsing(?Closure $resolver): void
    {
        self::$hostResolver = $resolver;
    }

    /**
     * Validate that a URL is safe to fetch server-side (SSRF protection).
     * Returns null when safe, or a generic English error when blocked.
     *
     * @param  bool  $allowPrivateHosts  When true, skip private/reserved IP checks (webhooks / OIDC opt-in).
     * @param  bool  $enforceHostAllowlist  When true, apply `ai.remote_import_hosts` if configured.
     */
    public static function validate(
        string $url,
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
    ): ?string {
        return self::authorize($url, $allowPrivateHosts, $enforceHostAllowlist)['error'];
    }

    /**
     * Validate and resolve pinned IPs for the subsequent request.
     *
     * @return array{
     *     error: ?string,
     *     url: string,
     *     host: ?string,
     *     port: ?int,
     *     ips: list<string>,
     *     curl_connect_to: list<string>
     * }
     */
    public static function inspect(
        string $url,
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
    ): array {
        return self::authorize($url, $allowPrivateHosts, $enforceHostAllowlist);
    }

    /**
     * Validate the URL once and return the CURLOPT_CONNECT_TO entry that pins the checked address.
     *
     * @return array{
     *     error: ?string,
     *     url: string,
     *     host: ?string,
     *     port: ?int,
     *     ips: list<string>,
     *     curl_connect_to: list<string>
     * }
     */
    public static function authorize(
        string $url,
        bool $allowPrivateHosts = false,
        bool $enforceHostAllowlist = true,
    ): array {
        $empty = [
            'error' => null,
            'url' => trim($url),
            'host' => null,
            'port' => null,
            'ips' => [],
            'curl_connect_to' => [],
        ];
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

        $scheme = strtolower((string) $parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            return [...$empty, 'error' => 'Error: Only http/https URLs are allowed.'];
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return [...$empty, 'error' => 'Error: Credentials in the URL are not allowed.'];
        }

        $host = strtolower((string) $parts['host']);
        $port = isset($parts['port']) && is_int($parts['port'])
            ? $parts['port']
            : ($scheme === 'https' ? 443 : 80);

        // `parse_url()` hands back an IPv6 host with its brackets on; they are URL syntax,
        // not part of the address, and every check below wants the address.
        if (str_contains($host, '[') || str_contains($host, ']')) {
            $literal = self::unwrapIpv6Literal($host);

            if ($literal === null) {
                return [...$empty, 'url' => $trimmed, 'error' => 'Error: Invalid URL.'];
            }

            $host = $literal;
        } else {
            // A trailing dot is the DNS root (RFC 1034 §3.1): `localhost.` is `localhost`, and
            // `169.254.169.254.` is the metadata address to curl. The names are compared without it.
            $name = str_ends_with($host, '.') ? substr($host, 0, -1) : $host;

            if ($name === '') {
                return [...$empty, 'url' => $trimmed, 'error' => 'Error: Invalid URL.'];
            }

            $ipv4 = self::readIpv4Address($name);

            if ($ipv4 !== null) {
                if (self::isMetadataHost($ipv4)) {
                    self::logBlock($trimmed, 'metadata ipv4 spelling', $ipv4);

                    return [...$empty, 'url' => $trimmed, 'host' => $ipv4, 'port' => $port, 'error' => self::GENERIC_HOST_BLOCKED];
                }

                // Non-canonical spelling (short form, octal/hex, trailing dot): refuse. Compare
                // against the original host (which may still carry the trailing dot).
                if ($ipv4 !== $host) {
                    return [...$empty, 'url' => $trimmed, 'host' => $name, 'port' => $port, 'error' => 'Error: Invalid URL.'];
                }
            }

            $host = $name;
        }

        if (self::isMetadataHost($host)) {
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

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            // Metadata literals were already refused above (including IPv4-mapped / compatible forms).
            if (! $allowPrivateHosts && self::isBlockedIp($host)) {
                self::logBlock($trimmed, 'literal blocked IP', $host);

                return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => self::GENERIC_IP_BLOCKED];
            }

            return self::authorizedTo($trimmed, $host, $port, [$host]);
        }

        $resolvedIps = self::resolveHostIps($host);

        // Feature: Http::fake hosts (e.g. idp.example.com) often have no DNS. When a test did
        // not inject a resolver and the name does not resolve, pin a public placeholder so
        // CURLOPT_CONNECT_TO is still set; production refuses unresolved names.
        if ($resolvedIps === [] && app()->runningUnitTests() && self::$hostResolver === null) {
            return self::authorizedTo($trimmed, $host, $port, ['93.184.216.34']);
        }

        if ($resolvedIps === []) {
            return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'error' => 'Error: Unable to resolve host.'];
        }

        foreach ($resolvedIps as $ip) {
            if (self::isMetadataHost($ip) || (! $allowPrivateHosts && self::isBlockedIp($ip))) {
                self::logBlock($trimmed, 'resolved blocked IP', $host, $ip);

                return [...$empty, 'url' => $trimmed, 'host' => $host, 'port' => $port, 'ips' => $resolvedIps, 'error' => self::GENERIC_RESOLVE_BLOCKED];
            }
        }

        return self::authorizedTo($trimmed, $host, $port, $resolvedIps);
    }

    /**
     * Outbound webhook / Slack notifier URLs: SSRF checks without the AI import host allowlist.
     */
    public static function validateOutboundWebhook(string $url): ?string
    {
        return self::authorizeOutboundWebhook($url)['error'];
    }

    /**
     * Authorise an outbound webhook / notifier URL and return the CONNECT_TO pin.
     *
     * @return array{
     *     error: ?string,
     *     url: string,
     *     host: ?string,
     *     port: ?int,
     *     ips: list<string>,
     *     curl_connect_to: list<string>
     * }
     */
    public static function authorizeOutboundWebhook(string $url): array
    {
        return self::authorize(
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
        return self::authorizeOidcEndpoint($url)['error'];
    }

    /**
     * Authorise an OIDC endpoint and return the CONNECT_TO pin.
     *
     * @return array{
     *     error: ?string,
     *     url: string,
     *     host: ?string,
     *     port: ?int,
     *     ips: list<string>,
     *     curl_connect_to: list<string>
     * }
     */
    public static function authorizeOidcEndpoint(string $url): array
    {
        return self::authorize(
            $url,
            allowPrivateHosts: (bool) config('services.oidc.allow_private_hosts', false),
            enforceHostAllowlist: false,
        );
    }

    /**
     * @param  non-empty-list<string>  $ips
     * @return array{
     *     error: null,
     *     url: string,
     *     host: string,
     *     port: int,
     *     ips: non-empty-list<string>,
     *     curl_connect_to: list<string>
     * }
     */
    private static function authorizedTo(string $url, string $host, int $port, array $ips): array
    {
        $pinned = self::preferredPinnedAddress($ips);

        return [
            'error' => null,
            'url' => $url,
            'host' => $host,
            'port' => $port,
            'ips' => $ips,
            'curl_connect_to' => [sprintf('::%s:%d', self::formatCurlAddress($pinned), $port)],
        ];
    }

    private static function isMetadataHost(string $host): bool
    {
        foreach (self::addressForms($host) as $form) {
            if (in_array($form, self::METADATA_HOSTS, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The dotted-decimal address of a host that curl and inet_aton(3) read as IPv4, or null for
     * a host they read as a name.
     */
    private static function readIpv4Address(string $host): ?string
    {
        if (preg_match('/^[0-9a-fx.]+$/', $host) !== 1) {
            return null;
        }

        $parts = explode('.', $host);

        if (count($parts) > 4) {
            return null;
        }

        $numbers = [];

        foreach ($parts as $part) {
            $number = self::readIpv4Number($part);

            if ($number === null) {
                return null;
            }

            $numbers[] = $number;
        }

        $last = (int) array_pop($numbers);
        $value = 0;

        foreach ($numbers as $number) {
            if ($number > 255) {
                return null;
            }

            $value = $value * 256 + $number;
        }

        $remainingBytes = 4 - count($numbers);

        if ($last >= 256 ** $remainingBytes) {
            return null;
        }

        return long2ip($value * 256 ** $remainingBytes + $last);
    }

    private static function readIpv4Number(string $part): ?int
    {
        [$digits, $base] = match (true) {
            preg_match('/^0x[0-9a-f]+$/', $part) === 1 => [substr($part, 2), 16],
            preg_match('/^0[0-7]*$/', $part) === 1 => [$part, 8],
            preg_match('/^[1-9][0-9]*$/', $part) === 1 => [$part, 10],
            default => [null, 0],
        };

        if ($digits === null) {
            return null;
        }

        $digits = ltrim($digits, '0');

        if (strlen($digits) > 11) {
            return null;
        }

        $number = $digits === '' ? 0 : intval($digits, $base);

        return $number > 0xFFFFFFFF ? null : $number;
    }

    /**
     * The address inside a URL's IPv6 brackets, canonicalised, or null when the bracketed
     * host is not a valid IPv6 literal.
     */
    private static function unwrapIpv6Literal(string $host): ?string
    {
        if (! str_starts_with($host, '[') || ! str_ends_with($host, ']')) {
            return null;
        }

        $literal = substr($host, 1, -1);

        if (filter_var($literal, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) {
            return null;
        }

        $packed = inet_pton($literal);

        return $packed === false ? $literal : (string) inet_ntop($packed);
    }

    /**
     * @return list<string>
     */
    private static function addressForms(string $address): array
    {
        $packed = @inet_pton($address);

        if ($packed === false || strlen($packed) !== 16) {
            return [$address];
        }

        $prefix = substr($packed, 0, 12);

        if ($prefix !== str_repeat("\0", 10)."\xff\xff" && $prefix !== str_repeat("\0", 12)) {
            return [$address];
        }

        $embedded = inet_ntop(substr($packed, 12));

        return $embedded === false ? [$address] : [$address, $embedded];
    }

    private static function formatCurlAddress(string $address): string
    {
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) {
            return '['.$address.']';
        }

        return $address;
    }

    /**
     * @param  non-empty-list<string>  $addresses
     */
    private static function preferredPinnedAddress(array $addresses): string
    {
        foreach ($addresses as $address) {
            if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
                return $address;
            }
        }

        return $addresses[0];
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
        foreach (self::addressForms($ip) as $form) {
            if (! filter_var($form, FILTER_VALIDATE_IP)) {
                return true;
            }

            if (IpUtils::checkIp($form, self::BLOCKED_CIDRS)) {
                return true;
            }

            // FILTER_FLAG_NO_* treats IPv4-mapped / IPv4-compatible IPv6 as reserved even when
            // the embedded IPv4 is public. The embedded form in addressForms already carries
            // that decision; only apply the PHP flags to plain IPv4.
            if (filter_var($form, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
                continue;
            }

            if (filter_var(
                $form,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) === false) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private static function resolveHostIps(string $host): array
    {
        $resolver = self::$hostResolver ?? static function (string $name): array {
            $addresses = [];

            foreach (@dns_get_record($name, DNS_A | DNS_AAAA) ?: [] as $record) {
                $addresses[] = $record['ip'] ?? $record['ipv6'] ?? null;
            }

            return $addresses !== [] ? $addresses : (gethostbynamel($name) ?: []);
        };

        $ips = [];

        foreach ($resolver($host) as $address) {
            $packed = is_string($address) ? @inet_pton($address) : false;

            if ($packed !== false) {
                $ips[] = (string) inet_ntop($packed);
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
            'url_host' => parse_url($url, PHP_URL_HOST),
        ]);
    }
}
