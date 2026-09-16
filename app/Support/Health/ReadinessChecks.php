<?php

namespace App\Support\Health;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

/**
 * Short-timeout dependency checks for HTTP readiness probes.
 */
class ReadinessChecks
{
    /**
     * @return array<string, string>
     */
    public function run(): array
    {
        $checks = [
            'database' => $this->database(),
        ];

        if ($this->redisRequired()) {
            $checks['redis'] = $this->redis();
        }

        return $checks;
    }

    public function database(): string
    {
        try {
            DB::connection()->getPdo();
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

    public function redisRequired(): bool
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
