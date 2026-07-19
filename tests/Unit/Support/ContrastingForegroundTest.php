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

test('invalid hex returns null', function () {
    expect(ContrastingForeground::forHex(null))->toBeNull()
        ->and(ContrastingForeground::forHex(''))->toBeNull()
        ->and(ContrastingForeground::forHex('not-a-color'))->toBeNull();
});
