<?php

declare(strict_types=1);

use App\Models\ApiKey;

/**
 * API key `ip_allowlist` matching: IPv4, IPv6 and IPv4-mapped clients through IpUtils.
 *
 * Semantics under test: empty allowlist allows every address; a malformed entry never matches
 * (fail closed); IPv4 single/CIDR behaviour stays identical; IPv4-mapped IPv6 clients
 * (`::ffff:x.x.x.x`) match an IPv4 allowlist entry (Symfony IpUtils treats them as the same host).
 */
dataset('ipv4 allowlist matches', [
    'single address' => ['203.0.113.10', ['203.0.113.10'], true],
    'single address miss' => ['203.0.113.11', ['203.0.113.10'], false],
    'cidr hit' => ['203.0.113.50', ['203.0.113.0/24'], true],
    'cidr miss' => ['198.51.100.50', ['203.0.113.0/24'], false],
    'cidr /32' => ['203.0.113.10', ['203.0.113.10/32'], true],
]);

it('keeps ipv4 single and cidr matching unchanged', function (string $clientIp, array $allowlist, bool $isAllowed): void {
    $apiKey = new ApiKey(['ip_allowlist' => $allowlist]);

    expect($apiKey->allowsIp($clientIp))->toBe($isAllowed);
})->with('ipv4 allowlist matches');

it('matches an ipv6 client against a single address and a cidr', function (string $clientIp, array $allowlist, bool $isAllowed): void {
    $apiKey = new ApiKey(['ip_allowlist' => $allowlist]);

    expect($apiKey->allowsIp($clientIp))->toBe($isAllowed);
})->with([
    'single hit' => ['2001:db8::1', ['2001:db8::1'], true],
    'single miss' => ['2001:db8::2', ['2001:db8::1'], false],
    'cidr hit' => ['2001:db8:abcd::1', ['2001:db8::/32'], true],
    'cidr miss' => ['2001:db9::1', ['2001:db8::/32'], false],
]);

it('matches an ipv4-mapped ipv6 client against an ipv4 allowlist entry', function (string $clientIp, array $allowlist): void {
    $apiKey = new ApiKey(['ip_allowlist' => $allowlist]);

    expect($apiKey->allowsIp($clientIp))->toBeTrue();
})->with([
    'mapped against single' => ['::ffff:203.0.113.5', ['203.0.113.5']],
    'mapped against cidr' => ['::ffff:203.0.113.5', ['203.0.113.0/24']],
]);

it('never matches a malformed allowlist entry (fail closed)', function (array $allowlist): void {
    $apiKey = new ApiKey(['ip_allowlist' => $allowlist]);

    expect($apiKey->allowsIp('203.0.113.5'))->toBeFalse()
        ->and($apiKey->allowsIp('2001:db8::1'))->toBeFalse();
})->with([
    'garbage string' => [['not-a-cidr']],
    'mask not numeric' => [['203.0.113.0/abc']],
    'ipv4 mask out of range' => [['203.0.113.0/33']],
    'ipv6 mask out of range' => [['2001:db8::/129']],
]);

it('allows every address when the allowlist is empty or null', function (?array $allowlist): void {
    $apiKey = new ApiKey(['ip_allowlist' => $allowlist]);

    expect($apiKey->allowsIp('203.0.113.5'))->toBeTrue()
        ->and($apiKey->allowsIp('2001:db8::1'))->toBeTrue();
})->with([
    'null' => [null],
    'empty array' => [[]],
]);

it('accepts only well-formed allowlist entries for validation', function (string $entry, bool $isValid): void {
    expect(ApiKey::isValidAllowlistEntry($entry))->toBe($isValid);
})->with([
    'ipv4' => ['203.0.113.10', true],
    'ipv4 cidr' => ['203.0.113.0/24', true],
    'ipv6' => ['2001:db8::1', true],
    'ipv6 cidr' => ['2001:db8::/32', true],
    'garbage' => ['not-a-cidr', false],
    'bad mask' => ['203.0.113.0/33', false],
    'empty' => ['', false],
]);
