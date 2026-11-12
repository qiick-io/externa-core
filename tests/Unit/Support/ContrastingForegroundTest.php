<?php

use App\Services\Css\ContrastingForegroundService;

test('dark hex gets light foreground', function () {
    expect(ContrastingForegroundService::forHex('#0f172a'))->toBe('#ffffff')
        ->and(ContrastingForegroundService::forHex('#112233'))->toBe('#ffffff')
        ->and(ContrastingForegroundService::forHex('#000000'))->toBe('#ffffff');
});

test('light hex gets dark foreground', function () {
    expect(ContrastingForegroundService::forHex('#ffffff'))->toBe('#000000')
        ->and(ContrastingForegroundService::forHex('#f8fafc'))->toBe('#000000')
        ->and(ContrastingForegroundService::forHex('#abcdef'))->toBe('#000000');
});

test('externa mark v3 brand bodies pick AA-safe foregrounds', function () {
    // Light body #0E7C86 → white (4.95:1); dark body #1A95A2 → black (5.86:1).
    expect(ContrastingForegroundService::forHex('#0E7C86'))->toBe('#ffffff')
        ->and(ContrastingForegroundService::forHex('#1A95A2'))->toBe('#000000')
        ->and(ContrastingForegroundService::forHex('#074F5A'))->toBe('#ffffff')
        ->and(ContrastingForegroundService::forHex('#2CB1BC'))->toBe('#000000');
});

test('invalid hex returns null', function () {
    expect(ContrastingForegroundService::forHex(null))->toBeNull()
        ->and(ContrastingForegroundService::forHex(''))->toBeNull()
        ->and(ContrastingForegroundService::forHex('not-a-color'))->toBeNull();
});
