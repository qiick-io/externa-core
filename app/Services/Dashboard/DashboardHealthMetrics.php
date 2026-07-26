<?php

namespace App\Services\Dashboard;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;
use Laravel\Horizon\Contracts\JobRepository;
use Laravel\Horizon\Contracts\MasterSupervisorRepository;
use Laravel\Horizon\Contracts\MetricsRepository;
use Laravel\Horizon\Contracts\WorkloadRepository;
use Throwable;

/**
 * Lightweight operational metrics for the dashboard Health tab (not full Pulse/Horizon UI).
 */
class DashboardHealthMetrics
{
    /**
     * @return array<string, mixed>
     */
    public function summary(): array
    {
        $horizon = $this->horizonMetrics();

        return [
            'queue_connection' => (string) config('queue.default'),
            'broadcast_connection' => (string) config('broadcasting.default'),
            'pulse_enabled' => (bool) config('pulse.enabled'),
            'pulse_ingest' => (string) config('pulse.ingest.driver', 'storage'),
            'pulse_available' => $this->pulseAvailable(),
            'redis_ok' => $this->redisOk(),
            'failed_jobs' => $this->failedJobsCount(),
            'pending_jobs' => $this->pendingJobsCount(),
            'exceptions_24h' => $this->pulseTypeCount('exception', 24),
            'slow_jobs_24h' => $this->pulseTypeCount('slow_job', 24),
            'slow_queries_24h' => $this->pulseTypeCount('slow_query', 24),
            'horizon' => $horizon,
        ];
    }

    /**
     * @return array{
     *     available: bool,
     *     status: string,
     *     masters: int,
     *     processes: int,
     *     pending: int,
     *     failed: int,
     *     jobs_per_minute: int|null,
     *     throughput: int|null,
     *     workloads: list<array{name: string, length: int, wait: int, processes: int}>
     * }
     */
    protected function horizonMetrics(): array
    {
        $empty = [
            'available' => false,
            'status' => 'unavailable',
            'masters' => 0,
            'processes' => 0,
            'pending' => 0,
            'failed' => 0,
            'jobs_per_minute' => null,
            'throughput' => null,
            'workloads' => [],
        ];

        if (! interface_exists(MetricsRepository::class)) {
            return $empty;
        }

        try {
            /** @var MasterSupervisorRepository $masters */
            $masters = app(MasterSupervisorRepository::class);
            /** @var WorkloadRepository $workloads */
            $workloads = app(WorkloadRepository::class);
            /** @var MetricsRepository $metrics */
            $metrics = app(MetricsRepository::class);
            /** @var JobRepository $jobs */
            $jobs = app(JobRepository::class);

            $masterNames = $masters->names();
            $workloadRows = collect($workloads->get())
                ->map(fn (array $row): array => [
                    'name' => (string) ($row['name'] ?? ''),
                    'length' => (int) ($row['length'] ?? 0),
                    'wait' => (int) ($row['wait'] ?? 0),
                    'processes' => (int) ($row['processes'] ?? 0),
                ])
                ->values()
                ->all();

            $processes = (int) collect($workloadRows)->sum('processes');
            $pending = (int) collect($workloadRows)->sum('length');
            $running = count($masterNames) > 0;

            return [
                'available' => true,
                'status' => $running ? 'running' : 'stopped',
                'masters' => count($masterNames),
                'processes' => $processes,
                'pending' => $pending,
                'failed' => (int) $jobs->totalFailed(),
                'jobs_per_minute' => (int) $metrics->jobsProcessedPerMinute(),
                'throughput' => (int) $metrics->throughput(),
                'workloads' => $workloadRows,
            ];
        } catch (Throwable) {
            return $empty;
        }
    }

    protected function pulseAvailable(): bool
    {
        return (bool) config('pulse.enabled') && Schema::hasTable('pulse_aggregates');
    }

    protected function redisOk(): bool
    {
        try {
            Redis::connection()->ping();

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    protected function failedJobsCount(): int
    {
        if (! Schema::hasTable('failed_jobs')) {
            return 0;
        }

        return (int) DB::table('failed_jobs')->count();
    }

    protected function pendingJobsCount(): int
    {
        $connection = (string) config('queue.default');

        if ($connection === 'database' && Schema::hasTable('jobs')) {
            return (int) DB::table('jobs')->count();
        }

        if ($connection === 'redis') {
            try {
                $queue = (string) config('queue.connections.redis.queue', 'default');

                return (int) Redis::connection(
                    (string) config('queue.connections.redis.connection', 'default')
                )->llen('queues:'.$queue);
            } catch (Throwable) {
                return 0;
            }
        }

        return 0;
    }

    /**
     * Count Pulse aggregate rows for a type in the last N hours (best-effort).
     */
    protected function pulseTypeCount(string $type, int $hours): int
    {
        if (! Schema::hasTable('pulse_aggregates')) {
            return 0;
        }

        try {
            $bucket = now()->subHours($hours)->getTimestamp();

            return (int) DB::table('pulse_aggregates')
                ->where('type', $type)
                ->where('bucket', '>=', $bucket)
                ->sum('count');
        } catch (Throwable) {
            return 0;
        }
    }
}
