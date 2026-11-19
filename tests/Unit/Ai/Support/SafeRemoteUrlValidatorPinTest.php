<?php

declare(strict_types=1);

use App\Ai\Support\SafeRemoteUrlValidator;

/**
 * What curl connects to, and how the guard knows it checked that address.
 *
 * `filter_var()` rejects `2852039166`, `0251.0376.0251.0376` and `169.254.169.254.`, but curl
 * and inet_aton(3) read each of them as 169.254.169.254. Before the fix the guard therefore
 * treated them as DNS names and CURLOPT_RESOLVE could not pin them (curl ignores RESOLVE for a
 * host it parses as an address itself).
 *
 * The fix pins every destination through CURLOPT_CONNECT_TO with an empty source host.
 */
beforeEach(function (): void {
    SafeRemoteUrlValidator::resolveUsing(null);
    config(['webhooks.allow_private_hosts' => false]);
});

afterEach(function (): void {
    SafeRemoteUrlValidator::resolveUsing(null);
});

/**
 * @param  list<string>  $addresses
 */
function pinGuard(array $addresses = ['93.184.216.34']): void
{
    SafeRemoteUrlValidator::resolveUsing(static fn (string $_host): array => $addresses);
}

function pinGuardThatMustNotResolve(): void
{
    SafeRemoteUrlValidator::resolveUsing(static function (string $host): array {
        throw new RuntimeException("Guard resolved an address literal as a name: {$host}");
    });
}

dataset('private host setting', [
    'setting off' => false,
    'setting on' => true,
]);

dataset('metadata ipv4 spellings', [
    'decimal' => 'http://2852039166/latest/meta-data/',
    'decimal with a port' => 'http://2852039166:80/latest/meta-data/',
    'dotted octal' => 'http://0251.0376.0251.0376/latest/meta-data/',
    'dotted hex' => 'http://0xa9.0xfe.0xa9.0xfe/latest/meta-data/',
    'dotted hex, upper case' => 'http://0XA9.0XFE.0XA9.0XFE/latest/meta-data/',
    'one hex number' => 'http://0xa9fea9fe/latest/meta-data/',
    'one octal number' => 'http://025177524776/latest/meta-data/',
    'mixed bases' => 'http://169.0376.0xa9.254/latest/meta-data/',
    'three parts' => 'http://169.254.43518/latest/meta-data/',
    'two parts' => 'http://169.16689662/latest/meta-data/',
    'trailing dot' => 'http://169.254.169.254./latest/meta-data/',
    'decimal with a trailing dot' => 'http://2852039166./latest/meta-data/',
]);

it('refuses every spelling of the ipv4 metadata address, whatever the setting', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->not->toBeNull();
})->with('metadata ipv4 spellings')->with('private host setting');

it('reads an ipv4 spelling as the address it is, and never looks it up as a name', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuardThatMustNotResolve();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->not->toBeNull();
})->with('metadata ipv4 spellings')->with('private host setting');

it('refuses an ipv4 address that is not written in dotted decimal, whatever the setting', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuardThatMustNotResolve();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->toBe('Error: Invalid URL.');
})->with([
    'short form, link local (169.254.255.254)' => 'http://169.254.65534/hook',
    'short form, public (1.0.0.1)' => 'http://1.1/hook',
    'decimal loopback' => 'http://2130706433/hook',
    'hex loopback, two parts' => 'http://0x7f.1/hook',
    'short loopback' => 'http://127.1/hook',
    'octal private' => 'http://012.0.0.1/hook',
    'leading zeroes' => 'http://127.000.000.001/hook',
    'decimal public (93.184.216.34)' => 'http://1572395042/hook',
    'canonical public with a trailing dot' => 'http://93.184.216.34./hook',
])->with('private host setting');

it('still treats a name that only looks numeric as a name and pins it', function (string $url): void {
    pinGuard();

    $authorized = SafeRemoteUrlValidator::authorizeOutboundWebhook($url);

    expect($authorized['error'])->toBeNull()
        ->and($authorized['curl_connect_to'])->toBe(['::93.184.216.34:443']);
})->with([
    'five parts' => 'https://1.2.3.4.5/hook',
    'a part over 255' => 'https://256.1.1.1/hook',
    'a whole address over 32 bits' => 'https://4294967296/hook',
    'a last part too big for the bytes left' => 'https://1.16777216/hook',
    'twelve significant digits' => 'https://123456789012/hook',
    'hex digits without the prefix' => 'https://cafe.1.2.3/hook',
    'an empty part' => 'https://1..2/hook',
    'a hostname made of hex letters' => 'https://deadbeef.example.com/hook',
]);

it('refuses a hostname that resolves to the metadata address, whatever the setting', function (array $addresses, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard($addresses);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('http://metadata.attacker.example/latest/meta-data/'))
        ->toBe('Error: Host resolves to a disallowed address (SSRF).');
})->with([
    'ec2 ipv4' => [['169.254.169.254']],
    'ec2 ipv6' => [['fd00:ec2::254']],
    'ec2 ipv6, uncompressed' => [['FD00:EC2:0:0:0:0:0:254']],
    'ipv4 mapped' => [['::ffff:169.254.169.254']],
    'ipv4 compatible' => [['::169.254.169.254']],
    'behind a public answer' => [['93.184.216.34', '169.254.169.254']],
])->with('private host setting');

it('keeps the metadata names blocked with a trailing dot', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->toBe('Error: Host not allowed (SSRF).');
})->with([
    'gce metadata name' => 'http://metadata.google.internal./computeMetadata/v1/',
    'bare metadata name' => 'http://metadata./computeMetadata/v1/',
])->with('private host setting');

it('pins every destination it authorises to exactly one checked address', function (string $url, array $addresses, bool $isPrivateAllowed, string $pin): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard($addresses);

    $authorized = SafeRemoteUrlValidator::authorizeOutboundWebhook($url);

    expect($authorized['error'])->toBeNull()
        ->and($authorized['curl_connect_to'])->toBe([$pin]);
})->with([
    'a public hostname' => ['https://hooks.example.com/hook', ['93.184.216.34'], false, '::93.184.216.34:443'],
    'a hostname over plain http' => ['http://hooks.example.com/hook', ['93.184.216.34'], false, '::93.184.216.34:80'],
    'a hostname with a port' => ['https://hooks.example.com:8443/hook', ['93.184.216.34'], false, '::93.184.216.34:8443'],
    'a fully qualified hostname' => ['https://hooks.example.com./hook', ['93.184.216.34'], false, '::93.184.216.34:443'],
    'a hostname with only ipv6' => ['https://v6.example.com/hook', ['2606:2800:220:1:248:1893:25c8:1946'], false, '::[2606:2800:220:1:248:1893:25c8:1946]:443'],
    'a public ipv4 literal' => ['https://93.184.216.34/hook', [], false, '::93.184.216.34:443'],
    'a public ipv6 literal' => ['https://[2606:2800:220:1:248:1893:25c8:1946]/hook', [], false, '::[2606:2800:220:1:248:1893:25c8:1946]:443'],
    'a public ipv4 mapped literal' => ['http://[::ffff:93.184.216.34]/hook', [], false, '::[::ffff:93.184.216.34]:80'],
    'a private literal, setting on' => ['http://10.0.0.5:8080/hook', [], true, '::10.0.0.5:8080'],
    'a private ipv6 literal, setting on' => ['http://[fc00::1]:8443/hook', [], true, '::[fc00::1]:8443'],
    'a hostname answering privately, setting on' => ['http://hooks.lan.example/hook', ['10.0.0.5'], true, '::10.0.0.5:80'],
    'localhost, setting on' => ['http://localhost:9000/hook', ['127.0.0.1'], true, '::127.0.0.1:9000'],
]);

it('refuses a host that does not resolve, whatever the setting, because there is nothing to pin', function (bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard([]);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('https://nxdomain.example.com/hook'))
        ->toBe('Error: Unable to resolve host.');
})->with('private host setting');

it('checks every record of a hostname, and pins one of them, ipv4 first', function (): void {
    $addresses = ['2606:2800:220:1:248:1893:25c8:1946', '93.184.216.34', '93.184.216.35'];
    pinGuard($addresses);

    expect(SafeRemoteUrlValidator::authorizeOutboundWebhook('https://many.example.com/hook')['curl_connect_to'])
        ->toBe(['::93.184.216.34:443']);

    pinGuard([...$addresses, '10.0.0.5']);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('https://many.example.com/hook'))
        ->toBe('Error: Host resolves to a disallowed address (SSRF).');
});

it('refuses a bracketed host that is not an ipv6 literal instead of treating it as a dns name', function (string $url): void {
    config(['webhooks.allow_private_hosts' => true]);
    pinGuard();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->toBe('Error: Invalid URL.');
})->with([
    'a zone id, which curl would still connect to' => 'http://[fe80::1%25en0]/hook',
    'a raw zone id' => 'http://[fe80::1%en0]/hook',
    'letters that are not hextets' => 'http://[not:an:ip]/hook',
    'a hostname in brackets' => 'http://[hooks.example.com]/hook',
    'an ipv4 address in brackets' => 'http://[127.0.0.1]/hook',
    'empty brackets' => 'http://[]/hook',
    'too many hextets' => 'http://[1:2:3:4:5:6:7:8:9]/hook',
]);

it('keeps every spelling of the ipv6 metadata address blocked when private hosts are allowed', function (string $url): void {
    config(['webhooks.allow_private_hosts' => true]);
    pinGuard();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->not->toBeNull();
})->with([
    'canonical' => 'http://[fd00:ec2::254]/latest/meta-data/',
    'uncompressed' => 'http://[FD00:EC2:0:0:0:0:0:254]/latest/meta-data/',
    'ipv4 mapped ec2 metadata' => 'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'ipv4 compatible ec2 metadata' => 'http://[::169.254.169.254]/latest/meta-data/',
]);

it('returns curl connect-to pin entries for an inspected public literal', function (): void {
    $authorized = SafeRemoteUrlValidator::authorize('https://8.8.8.8/dns', allowPrivateHosts: false, enforceHostAllowlist: false);

    expect($authorized['error'])->toBeNull()
        ->and($authorized['curl_connect_to'])->toBe(['::8.8.8.8:443']);
});
