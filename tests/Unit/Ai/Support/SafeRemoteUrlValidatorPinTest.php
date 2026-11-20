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

/**
 * Every spelling the guard canonicalises to the Alibaba (100.100.100.200) and Oracle
 * (192.0.0.192) metadata addresses. Both sit in ranges blocked while private hosts are
 * off; the regression is that `allowPrivateHosts=true` made them reachable.
 */
dataset('cloud metadata ipv4 spellings', [
    'alibaba dotted decimal' => 'https://100.100.100.200/latest/meta-data/',
    'alibaba dotted decimal with a port' => 'https://100.100.100.200:443/latest/meta-data/',
    'alibaba decimal' => 'https://1684301000/latest/meta-data/',
    'alibaba dotted octal' => 'https://0144.0144.0144.0310/latest/meta-data/',
    'alibaba dotted hex' => 'https://0x64.0x64.0x64.0xc8/latest/meta-data/',
    'alibaba dotted hex, upper case' => 'https://0X64.0X64.0X64.0XC8/latest/meta-data/',
    'alibaba one hex number' => 'https://0x646464c8/latest/meta-data/',
    'alibaba one octal number' => 'https://014431062310/latest/meta-data/',
    'alibaba mixed bases' => 'https://100.0144.0x64.200/latest/meta-data/',
    'alibaba three parts' => 'https://100.100.25800/latest/meta-data/',
    'alibaba two parts' => 'https://100.6579400/latest/meta-data/',
    'alibaba trailing dot' => 'https://100.100.100.200./latest/meta-data/',
    'oracle dotted decimal' => 'https://192.0.0.192/latest/meta-data/',
    'oracle dotted decimal with a port' => 'https://192.0.0.192:443/latest/meta-data/',
    'oracle decimal' => 'https://3221225664/latest/meta-data/',
    'oracle dotted octal' => 'https://0300.0.0.0300/latest/meta-data/',
    'oracle one octal number' => 'https://030000000300/latest/meta-data/',
    'oracle dotted hex' => 'https://0xc0.0x0.0x0.0xc0/latest/meta-data/',
    'oracle dotted hex, upper case' => 'https://0XC0.0X0.0X0.0XC0/latest/meta-data/',
    'oracle one hex number' => 'https://0xc00000c0/latest/meta-data/',
    'oracle mixed bases' => 'https://0300.0x0.0.192/latest/meta-data/',
    'oracle three parts' => 'https://192.0.192/latest/meta-data/',
    'oracle two parts' => 'https://192.192/latest/meta-data/',
    'oracle trailing dot' => 'https://192.0.0.192./latest/meta-data/',
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

it('refuses every spelling of the alibaba and oracle metadata addresses, whatever the setting', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->not->toBeNull();
})->with('cloud metadata ipv4 spellings')->with('private host setting');

it('reads an alibaba or oracle metadata spelling as the address it is, and never looks it up as a name', function (string $url, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuardThatMustNotResolve();

    expect(SafeRemoteUrlValidator::validateOutboundWebhook($url))->not->toBeNull();
})->with('cloud metadata ipv4 spellings')->with('private host setting');

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

it('refuses a hostname that resolves to an alibaba or oracle metadata address, whatever the setting', function (array $addresses, bool $isPrivateAllowed): void {
    config(['webhooks.allow_private_hosts' => $isPrivateAllowed]);
    pinGuard($addresses);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('http://metadata.attacker.example/latest/meta-data/'))
        ->toBe('Error: Host resolves to a disallowed address (SSRF).');
})->with([
    'alibaba ipv4' => [['100.100.100.200']],
    'alibaba ipv4 mapped' => [['::ffff:100.100.100.200']],
    'alibaba ipv4 mapped in hextets' => [['::ffff:6464:64c8']],
    'alibaba ipv4 compatible' => [['::100.100.100.200']],
    'alibaba ipv4 compatible in hextets' => [['::6464:64c8']],
    'alibaba behind a public answer' => [['93.184.216.34', '100.100.100.200']],
    'oracle ipv4' => [['192.0.0.192']],
    'oracle ipv4 mapped' => [['::ffff:192.0.0.192']],
    'oracle ipv4 mapped in hextets' => [['::ffff:c000:c0']],
    'oracle ipv4 compatible' => [['::192.0.0.192']],
    'oracle ipv4 compatible in hextets' => [['::c000:c0']],
    'oracle behind a public answer' => [['93.184.216.34', '192.0.0.192']],
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
    'alibaba ipv4 mapped' => 'http://[::ffff:100.100.100.200]/latest/meta-data/',
    'alibaba ipv4 mapped in hextets' => 'http://[::ffff:6464:64c8]/latest/meta-data/',
    'alibaba ipv4 mapped, upper case' => 'http://[::FFFF:6464:64C8]/latest/meta-data/',
    'alibaba ipv4 mapped, expanded' => 'http://[0:0:0:0:0:ffff:6464:64c8]/latest/meta-data/',
    'alibaba ipv4 compatible' => 'http://[::100.100.100.200]/latest/meta-data/',
    'alibaba ipv4 compatible in hextets' => 'http://[::6464:64c8]/latest/meta-data/',
    'oracle ipv4 mapped' => 'http://[::ffff:192.0.0.192]/latest/meta-data/',
    'oracle ipv4 mapped in hextets' => 'http://[::ffff:c000:c0]/latest/meta-data/',
    'oracle ipv4 mapped, upper case' => 'http://[::FFFF:C000:C0]/latest/meta-data/',
    'oracle ipv4 mapped, expanded' => 'http://[0:0:0:0:0:ffff:c000:c0]/latest/meta-data/',
    'oracle ipv4 compatible' => 'http://[::192.0.0.192]/latest/meta-data/',
    'oracle ipv4 compatible in hextets' => 'http://[::c000:c0]/latest/meta-data/',
]);

it('returns curl connect-to pin entries for an inspected public literal', function (): void {
    $authorized = SafeRemoteUrlValidator::authorize('https://8.8.8.8/dns', allowPrivateHosts: false, enforceHostAllowlist: false);

    expect($authorized['error'])->toBeNull()
        ->and($authorized['curl_connect_to'])->toBe(['::8.8.8.8:443']);
});
