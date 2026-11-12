<?php

use App\Services\Health\ReadinessChecksService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

test('database check returns fail when connection throws', function () {
    DB::shouldReceive('connection')->once()->andThrow(new RuntimeException('db down'));

    expect(app(ReadinessChecksService::class)->database())->toBe('fail');
});

test('redis check returns fail when ping throws', function () {
    Redis::shouldReceive('connection')->once()->andThrow(new RuntimeException('redis down'));

    expect(app(ReadinessChecksService::class)->redis())->toBe('fail');
});

test('redis is required when queue uses redis', function () {
    config([
        'queue.default' => 'redis',
        'cache.default' => 'array',
        'session.driver' => 'array',
        'broadcasting.default' => 'null',
    ]);

    expect(app(ReadinessChecksService::class)->isRedisRequired())->toBeTrue();
});

test('redis is not required for sync queue and array cache', function () {
    config([
        'queue.default' => 'sync',
        'cache.default' => 'array',
        'session.driver' => 'array',
        'broadcasting.default' => 'null',
    ]);

    expect(app(ReadinessChecksService::class)->isRedisRequired())->toBeFalse();
});
