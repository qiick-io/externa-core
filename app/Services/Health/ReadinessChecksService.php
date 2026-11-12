<?php

declare(strict_types=1);

namespace App\Services\Health;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Short-timeout dependency checks for HTTP readiness probes.
 */
class ReadinessChecksService
{
    /**
     * @return array<string, string>
     */
    public function run(): array
    {
        $checks = [
            'database' => $this->database(),
        ];

        if ($this->isRedisRequired()) {
            $checks['redis'] = $this->redis();
        }

        return $checks;
    }

    public function database(): string
    {
        try {
            DB::connection()->getPdo();
            // raw-sql: reviewed — fixed readiness probe `select 1`
            DB::select('select 1');

            return 'ok';
        } catch (Throwable) {
            return 'fail';
        }
    }

    public function redis(): string
    {
        try {
            $pong = Redis::connection()->ping();

            return ($pong === true || $pong === 'PONG' || $pong === '+PONG') ? 'ok' : 'fail';
        } catch (Throwable) {
            return 'fail';
        }
    }

    public function isRedisRequired(): bool
    {
        return $this->usesRedisDriver(config('queue.default'))
            || $this->usesRedisDriver(config('cache.default'))
            || $this->usesRedisDriver(config('session.driver'))
            || $this->usesRedisDriver(config('broadcasting.default'));
    }

    private function usesRedisDriver(mixed $name): bool
    {
        return is_string($name) && $name === 'redis';
    }
}
