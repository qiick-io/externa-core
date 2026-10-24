<?php

use Illuminate\Support\Facades\Route;

beforeEach(function (): void {
    Route::get('/__trusted-proxy-probe', fn () => response()->json([
        'ip' => request()->ip(),
        'secure' => request()->isSecure(),
    ]));
});

it('reads TRUSTED_PROXIES from the environment', function (): void {
    $_ENV['TRUSTED_PROXIES'] = $_SERVER['TRUSTED_PROXIES'] = '10.0.0.0/8';

    try {
        expect((require config_path('trustedproxy.php'))['proxies'])->toBe('10.0.0.0/8');
    } finally {
        unset($_ENV['TRUSTED_PROXIES'], $_SERVER['TRUSTED_PROXIES']);
    }
});

$forwarded = ['X-Forwarded-For' => '203.0.113.7', 'X-Forwarded-Proto' => 'https'];

it('ignores forwarded headers when no proxy is trusted', function () use ($forwarded): void {
    config(['trustedproxy.proxies' => null]);

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.5'])
        ->getJson('/__trusted-proxy-probe', $forwarded)
        ->assertJson(['ip' => '10.0.0.5', 'secure' => false]);
});

it('uses the forwarded client ip behind a trusted proxy', function (?string $proxies) use ($forwarded): void {
    config(['trustedproxy.proxies' => $proxies]);

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.5'])
        ->getJson('/__trusted-proxy-probe', $forwarded)
        ->assertJson(['ip' => '203.0.113.7', 'secure' => true]);
})->with(['wildcard' => '*', 'cidr list' => '192.168.1.1, 10.0.0.0/8']);
