<?php

use App\Ai\Support\SafeRemoteUrlValidator;

it('blocks CGNAT and Alibaba metadata range', function (): void {
    expect(SafeRemoteUrlValidator::validate('http://100.100.100.200/latest/meta-data'))
        ->toBe('Error: IP address not allowed (SSRF).')
        ->and(SafeRemoteUrlValidator::validate('http://100.64.0.1/'))
        ->toBe('Error: IP address not allowed (SSRF).');
});

it('blocks RFC1918 and loopback literals', function (): void {
    expect(SafeRemoteUrlValidator::validate('http://10.0.0.1/x'))->not->toBeNull()
        ->and(SafeRemoteUrlValidator::validate('http://192.168.1.1/x'))->not->toBeNull()
        ->and(SafeRemoteUrlValidator::validate('http://127.0.0.1/x'))->not->toBeNull()
        ->and(SafeRemoteUrlValidator::validate('http://[::1]/x'))->not->toBeNull();
});

it('allows public https URL shape without resolving when host is IP public', function (): void {
    expect(SafeRemoteUrlValidator::validate('https://8.8.8.8/dns'))->toBeNull();
});

it('returns curl resolve pin entries for inspected host', function (): void {
    $inspected = SafeRemoteUrlValidator::inspect('https://8.8.8.8/dns');

    expect($inspected['error'])->toBeNull()
        ->and($inspected['host'])->toBe('8.8.8.8')
        ->and($inspected['port'])->toBe(443)
        ->and($inspected['ips'])->toBe(['8.8.8.8'])
        ->and(SafeRemoteUrlValidator::curlResolveEntries('8.8.8.8', 443, $inspected['ips']))
        ->toBe(['8.8.8.8:443:8.8.8.8']);
});

it('returns a generic user message for blocked CGNAT (no IP oracle)', function (): void {
    $message = SafeRemoteUrlValidator::validate('http://100.64.1.1/hook');

    expect($message)->toBe('Error: IP address not allowed (SSRF).')
        ->and($message)->not->toContain('100.64');
});

it('oidc validator respects private-host opt-in', function (): void {
    config(['services.oidc.allow_private_hosts' => false]);
    expect(SafeRemoteUrlValidator::validateOidcEndpoint('http://10.0.0.5/.well-known/openid-configuration'))
        ->not->toBeNull();

    config(['services.oidc.allow_private_hosts' => true]);
    expect(SafeRemoteUrlValidator::validateOidcEndpoint('http://10.0.0.5/.well-known/openid-configuration'))
        ->toBeNull();
});

it('webhook private-host opt-in still blocks metadata hostname', function (): void {
    config(['webhooks.allow_private_hosts' => true]);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('http://metadata/'))
        ->toBe('Error: Host not allowed (SSRF).');
});
