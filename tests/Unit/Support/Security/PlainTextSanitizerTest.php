<?php

use App\Support\Security\PlainTextSanitizer;

it('passes through null and empty', function (?string $input, ?string $expected): void {
    expect(PlainTextSanitizer::sanitize($input))->toBe($expected);
})->with([
    [null, null],
    ['', ''],
    ['   ', ''],
]);

it('strips html tags and trims', function (string $input, string $expected): void {
    expect(PlainTextSanitizer::sanitize($input))->toBe($expected);
})->with([
    ['<script>alert(1)</script>', 'alert(1)'],
    ['<img onerror=alert(1) src=x>', ''],
    ['Hello <b>world</b>', 'Hello world'],
    ['<p>nested <em>tags</em></p>', 'nested tags'],
    ['  plain text  ', 'plain text'],
    ['safe', 'safe'],
]);
