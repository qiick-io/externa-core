<?php

use App\Support\Css\ContrastingForeground;

test('dark hex gets light foreground', function () {
    expect(ContrastingForeground::forHex('#0f172a'))->toBe('#ffffff')
        ->and(ContrastingForeground::forHex('#112233'))->toBe('#ffffff')
        ->and(ContrastingForeground::forHex('#000000'))->toBe('#ffffff');
});

test('light hex gets dark foreground', function () {
    expect(ContrastingForeground::forHex('#ffffff'))->toBe('#000000')
        ->and(ContrastingForeground::forHex('#f8fafc'))->toBe('#000000')
        ->and(ContrastingForeground::forHex('#abcdef'))->toBe('#000000');
});

test('externa mark v3 brand bodies pick AA-safe foregrounds', function () {
    // Light body #0E7C86 → white (4.95:1); dark body #1A95A2 → black (5.86:1).
    expect(ContrastingForeground::forHex('#0E7C86'))->toBe('#ffffff')
        ->and(ContrastingForeground::forHex('#1A95A2'))->toBe('#000000')
        ->and(ContrastingForeground::forHex('#074F5A'))->toBe('#ffffff')
        ->and(ContrastingForeground::forHex('#2CB1BC'))->toBe('#000000');
});

test('invalid hex returns null', function () {
    expect(ContrastingForeground::forHex(null))->toBeNull()
        ->and(ContrastingForeground::forHex(''))->toBeNull()
        ->and(ContrastingForeground::forHex('not-a-color'))->toBeNull();
});
