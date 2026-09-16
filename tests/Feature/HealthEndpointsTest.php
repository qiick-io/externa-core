<?php

use App\Support\Health\ReadinessChecks;

test('liveness returns 200 when the app responds', function () {
    $this->getJson('/health/live')
        ->assertOk()
        ->assertJson(['status' => 'ok']);
});

test('laravel up liveness still returns 200', function () {
    $this->get('/up')->assertOk();
});

test('readiness returns 200 with database check when redis not required', function () {
    config([
        'queue.default' => 'sync',
        'cache.default' => 'array',
        'session.driver' => 'array',
        'broadcasting.default' => 'null',
    ]);

    $this->getJson('/health/ready')
        ->assertOk()
        ->assertJsonPath('status', 'ok')
        ->assertJsonPath('checks.database', 'ok')
        ->assertJsonMissingPath('checks.redis');
});

test('readiness returns 503 when database is down', function () {
    $this->mock(ReadinessChecks::class, function ($mock): void {
        $mock->shouldReceive('run')->once()->andReturn([
            'database' => 'fail',
        ]);
    });

    $this->getJson('/health/ready')
        ->assertStatus(503)
        ->assertJsonPath('status', 'fail')
        ->assertJsonPath('checks.database', 'fail');
});

test('readiness returns 503 when required redis is down', function () {
    $this->mock(ReadinessChecks::class, function ($mock): void {
        $mock->shouldReceive('run')->once()->andReturn([
            'database' => 'ok',
            'redis' => 'fail',
        ]);
    });

    $this->getJson('/health/ready')
        ->assertStatus(503)
        ->assertJsonPath('status', 'fail')
        ->assertJsonPath('checks.database', 'ok')
        ->assertJsonPath('checks.redis', 'fail');
});
