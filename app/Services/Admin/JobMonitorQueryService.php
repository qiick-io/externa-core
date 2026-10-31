<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;

/**
 * Read models for the admin queue monitor (pending + failed jobs).
 */
class JobMonitorQueryService
{
    /**
     * @return array{pending_count: int, pending: list<array<string, mixed>>, failed: list<array<string, mixed>>}
     */
    public function snapshot(): array
    {
        $pendingCount = DB::table('jobs')->count();
        $pendingSample = DB::table('jobs')
            ->orderByDesc('id')
            ->limit(25)
            ->get(['id', 'queue', 'payload', 'attempts', 'available_at', 'created_at'])
            ->map(function ($job): array {
                $payload = json_decode((string) $job->payload, true) ?: [];
                $displayName = is_array($payload) ? ($payload['displayName'] ?? null) : null;

                return [
                    'id' => $job->id,
                    'queue' => $job->queue,
                    'display_name' => is_string($displayName) ? $displayName : 'Job',
                    'attempts' => $job->attempts,
                    'available_at' => $job->available_at,
                    'created_at' => $job->created_at,
                ];
            })
            ->values()
            ->all();

        $failed = DB::table('failed_jobs')
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'uuid', 'connection', 'queue', 'payload', 'exception', 'failed_at'])
            ->map(function ($job): array {
                $payload = json_decode((string) $job->payload, true) ?: [];
                $displayName = is_array($payload) ? ($payload['displayName'] ?? null) : null;
                $exception = (string) $job->exception;
                if (strlen($exception) > 500) {
                    $exception = substr($exception, 0, 500).'…';
                }

                return [
                    'id' => $job->id,
                    'uuid' => $job->uuid,
                    'queue' => $job->queue,
                    'display_name' => is_string($displayName) ? $displayName : 'Job',
                    'exception' => $exception,
                    'failed_at' => $job->failed_at,
                ];
            })
            ->values()
            ->all();

        return [
            'pending_count' => $pendingCount,
            'pending' => $pendingSample,
            'failed' => $failed,
        ];
    }
}
