<?php

namespace App\Http\Controllers;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

/**
 * Renders the dashboard with cached operational and storage metrics.
 */
class DashboardController
{
    /**
     * Show recent activity, file stats, upload health, and deferred storage breakdowns.
     */
    public function index(Request $request): Response
    {
        $now = now();

        $latestActivity = Cache::remember(
            'dashboard:latest-activity',
            $now->copy()->addSeconds(60),
            fn (): array => Activity::query()
                ->latest('id')
                ->limit(10)
                ->with(['causer', 'subject'])
                ->get()
                ->map(fn (Activity $activity): array => [
                    'id' => $activity->id,
                    'log_name' => $activity->log_name,
                    'event' => $activity->event,
                    'description' => $activity->description,
                    'created_at' => $activity->created_at?->toIso8601String(),
                    'causer' => $activity->causer
                        ? [
                            'id' => $activity->causer->getKey(),
                            'label' => method_exists($activity->causer, 'getName')
                                ? $activity->causer->getName()
                                : ($activity->causer->name ?? (string) $activity->causer->getKey()),
                        ]
                        : null,
                    'subject' => $activity->subject
                        ? [
                            'type' => $activity->subject_type,
                            'id' => $activity->subject->getKey(),
                            'label' => $activity->subject->name ?? (string) $activity->subject->getKey(),
                        ]
                        : null,
                ])
                ->all(),
        );

        $fileStats = Cache::remember(
            'dashboard:file-stats',
            $now->copy()->addSeconds(60),
            fn (): array => [
                'files_count' => File::query()->where('type', FileTypeEnum::File)->count(),
                'folders_count' => File::query()->where('type', FileTypeEnum::Folder)->count(),
                'files_size_sum' => (int) (File::query()
                    ->where('type', FileTypeEnum::File)
                    ->sum('size') ?? 0),
            ],
        );

        $uploadHealth = Cache::remember(
            'dashboard:upload-health',
            $now->copy()->addSeconds(60),
            fn (): array => [
                'in_progress_count' => FileUpload::query()
                    ->whereColumn('uploaded_chunks', '<', 'total_chunks')
                    ->count(),
                'stale_count' => FileUpload::query()
                    ->where('expires_at', '<=', $now)
                    ->count(),
            ],
        );

        $mostActiveUsers = Cache::remember(
            'dashboard:most-active-users:24h',
            $now->copy()->addSeconds(60),
            function () use ($now): array {
                $mostActiveUserCounts = Activity::query()
                    ->where('created_at', '>=', $now->copy()->subDay())
                    ->where('causer_type', User::class)
                    ->whereNotNull('causer_id')
                    ->selectRaw('causer_id, COUNT(*) as activity_count')
                    ->groupBy('causer_id')
                    ->orderByDesc('activity_count')
                    ->limit(5)
                    ->get();

                $userIds = $mostActiveUserCounts->pluck('causer_id')->filter()->unique()->values()->all();
                $usersById = User::query()
                    ->whereIn('id', $userIds)
                    ->get()
                    ->keyBy('id');

                return $mostActiveUserCounts
                    ->map(function ($row) use ($usersById): array {
                        $userId = (int) $row->causer_id;
                        $user = $usersById->get($userId);

                        return [
                            'id' => $userId,
                            'label' => $user?->name ?: ($user?->username ?: ($user?->email ?: (string) $userId)),
                            'activity_count' => (int) $row->activity_count,
                        ];
                    })
                    ->all();
            },
        );

        $suspiciousEvents = Cache::remember(
            'dashboard:suspicious-events:1h',
            $now->copy()->addSeconds(60),
            fn (): array => Activity::query()
                ->where('created_at', '>=', $now->copy()->subHour())
                ->where('event', 'failed')
                ->latest('id')
                ->limit(25)
                ->with(['causer'])
                ->get()
                ->map(fn (Activity $activity): array => [
                    'id' => $activity->id,
                    'log_name' => $activity->log_name,
                    'event' => $activity->event,
                    'description' => $activity->description,
                    'created_at' => $activity->created_at?->toIso8601String(),
                    'causer' => $activity->causer
                        ? [
                            'id' => $activity->causer->getKey(),
                            'label' => method_exists($activity->causer, 'getName')
                                ? $activity->causer->getName()
                                : ($activity->causer->name ?? (string) $activity->causer->getKey()),
                        ]
                        : null,
                ])
                ->all(),
        );

        $stuckOrphanUploads = Cache::remember(
            'dashboard:stuck-orphan-uploads',
            $now->copy()->addSeconds(60),
            fn (): array => FileUpload::query()
                ->where(function ($query) use ($now): void {
                    $query
                        ->whereNull('parent_id')
                        ->orWhere('expires_at', '<=', $now)
                        ->orWhere(function ($query) use ($now): void {
                            $query
                                ->whereColumn('uploaded_chunks', '<', 'total_chunks')
                                ->where('created_at', '<=', $now->copy()->subMinutes(30));
                        });
                })
                ->latest('id')
                ->limit(10)
                ->get()
                ->map(fn (FileUpload $upload): array => [
                    'id' => $upload->id,
                    'upload_id' => $upload->upload_id,
                    'file_name' => $upload->file_name,
                    'disk' => $upload->disk,
                    'parent_id' => $upload->parent_id,
                    'total_size' => $upload->total_size,
                    'uploaded_chunks' => $upload->uploaded_chunks,
                    'total_chunks' => $upload->total_chunks,
                    'expires_at' => $upload->expires_at?->toIso8601String(),
                    'created_at' => $upload->created_at?->toIso8601String(),
                ])
                ->all(),
        );

        return Inertia::render('dashboard', [
            'latestActivity' => $latestActivity,
            'fileStats' => $fileStats,
            'uploadHealth' => $uploadHealth,
            'mostActiveUsers' => $mostActiveUsers,
            'suspiciousEvents' => $suspiciousEvents,
            'stuckOrphanUploads' => $stuckOrphanUploads,
            'largestFiles' => Cache::remember(
                'dashboard:largest-files',
                $now->copy()->addSeconds(60),
                fn (): array => File::query()
                    ->where('type', FileTypeEnum::File)
                    ->whereNotNull('size')
                    ->orderByDesc('size')
                    ->limit(10)
                    ->get(['id', 'name', 'path', 'disk', 'size', 'created_at'])
                    ->map(fn (File $file): array => [
                        'id' => $file->id,
                        'name' => $file->name,
                        'path' => $file->path,
                        'disk' => $file->disk,
                        'size' => (int) ($file->size ?? 0),
                        'created_at' => $file->created_at?->toIso8601String(),
                    ])
                    ->all(),
            ),
            'fileStatsByDisk' => Inertia::defer(
                fn (): array => Cache::remember(
                    'dashboard:file-stats-by-disk',
                    $now->copy()->addSeconds(60),
                    fn (): array => File::query()
                        ->where('type', FileTypeEnum::File)
                        ->selectRaw('disk, COUNT(*) as files_count, COALESCE(SUM(size), 0) as files_size_sum')
                        ->groupBy('disk')
                        ->orderBy('disk')
                        ->get()
                        ->map(fn ($row): array => [
                            'disk' => (string) $row->disk,
                            'files_count' => (int) $row->files_count,
                            'files_size_sum' => (int) $row->files_size_sum,
                        ])
                        ->all(),
                ),
                'storage',
            ),
            'storageTrend' => Cache::remember(
                'dashboard:storage-trend:14d',
                $now->copy()->addHours(1),
                function () use ($now): array {
                    $days = 14;
                    $startDate = $now->copy()->startOfDay()->subDays($days - 1);

                    $bytesAddedByDate = File::query()
                        ->where('type', FileTypeEnum::File)
                        ->where('created_at', '>=', $startDate)
                        ->selectRaw('DATE(created_at) as date, COALESCE(SUM(size), 0) as bytes_added')
                        ->groupBy('date')
                        ->orderBy('date')
                        ->get()
                        ->mapWithKeys(fn ($row): array => [(string) $row->date => (int) $row->bytes_added])
                        ->all();

                    $trend = [];
                    for ($dayOffset = 0; $dayOffset < $days; $dayOffset++) {
                        $date = $startDate->copy()->addDays($dayOffset)->toDateString();
                        $trend[] = [
                            'date' => $date,
                            'bytes_added' => (int) ($bytesAddedByDate[$date] ?? 0),
                        ];
                    }

                    return $trend;
                },
            ),
        ]);
    }
}
