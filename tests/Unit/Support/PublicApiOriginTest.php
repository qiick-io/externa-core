<?php

use App\Support\Api\PublicApiOrigin;

it('normalizes valid origins without path', function (string $input, string $expected): void {
    expect(PublicApiOrigin::normalize($input))->toBe($expected)
        ->and(PublicApiOrigin::isValid($input))->toBeTrue();
})->with([
    ['https://www.example.com', 'https://www.example.com'],
    ['https://www.example.com/', 'https://www.example.com'],
    ['HTTP://APP.Example.COM:8080', 'http://app.example.com:8080'],
    ['https://app.example.com:443', 'https://app.example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
]);

it('rejects origins with path, query, or credentials', function (string $input): void {
    expect(PublicApiOrigin::normalize($input))->toBeNull()
        ->and(PublicApiOrigin::isValid($input))->toBeFalse();
})->with([
    'https://www.example.com/path',
    'https://www.example.com?q=1',
    'https://www.example.com#hash',
    'https://user:pass@www.example.com',
    'ftp://www.example.com',
    'not-a-url',
    '',
]);
