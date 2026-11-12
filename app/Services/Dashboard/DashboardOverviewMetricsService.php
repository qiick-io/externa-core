<?php

declare(strict_types=1);

namespace App\Services\Dashboard;

use App\Enums\FileTypeEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;

/**
 * Cached activity, file, upload, storage and content metrics for the dashboard page.
 *
 * Each method returns one Inertia prop of the `dashboard` page, cached under a
 * `dashboard:*` key (listed in PerformanceSettingsController::DASHBOARD_CACHE_KEYS so
 * the cache can be cleared). `$now` is the request time, shared by every metric so
 * the windows (last hour, 24 hours, 14 and 30 days) line up within one page load.
 */
class DashboardOverviewMetricsService
{
    public function __construct(
        private readonly DashboardHealthMetricsService $healthMetrics,
    ) {}

    /**
     * The ten most recent activity-log entries with their causer and subject.
     *
     * @return list<array<string, mixed>>
     */
    public function latestActivity(CarbonInterface $now): array
    {
        return Cache::remember(
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
    }

    /**
     * File and folder counts and the total size of all files.
     *
     * @return array{files_count: int, folders_count: int, files_size_sum: int}
     */
    public function fileStats(CarbonInterface $now): array
    {
        return Cache::remember(
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
    }

    /**
     * Chunked uploads still in progress and uploads past their expiry.
     *
     * @return array{in_progress_count: int, stale_count: int}
     */
    public function uploadHealth(CarbonInterface $now): array
    {
        return Cache::remember(
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
    }

    /**
     * The five users with the most activity-log entries in the last 24 hours.
     *
     * @return list<array{id: int, label: string, activity_count: int}>
     */
    public function mostActiveUsers(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:most-active-users:24h',
            $now->copy()->addSeconds(60),
            function () use ($now): array {
                $mostActiveUserCounts = Activity::query()
                    ->where('created_at', '>=', $now->copy()->subDay())
                    ->where('causer_type', User::class)
                    ->whereNotNull('causer_id')
                    // raw-sql: reviewed — fixed aggregate/group-by analytics; no user identifiers in SQL
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
                            'activity_count' => (int) $row->getAttribute('activity_count'),
                        ];
                    })
                    ->all();
            },
        );
    }

    /**
     * Up to 25 `failed` activity-log events of the last hour (failed sign-ins and the like).
     *
     * @return list<array<string, mixed>>
     */
    public function suspiciousEvents(CarbonInterface $now): array
    {
        return Cache::remember(
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
    }

    /**
     * The ten latest uploads that look stuck: no parent, expired, or incomplete for 30 minutes.
     *
     * @return list<array<string, mixed>>
     */
    public function stuckOrphanUploads(CarbonInterface $now): array
    {
        return Cache::remember(
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
    }

    /**
     * The Health tab summary from {@see DashboardHealthMetricsService::summary()}.
     *
     * @return array<string, mixed>
     */
    public function health(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:health',
            $now->copy()->addSeconds(60),
            fn (): array => $this->healthMetrics->summary(),
        );
    }

    /**
     * The ten largest files.
     *
     * @return list<array{id: int, name: string, path: string, disk: string, size: int, created_at: string|null}>
     */
    public function largestFiles(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:largest-files',
            $now->copy()->addSeconds(60),
            fn (): array => File::query()
                // Partial select: the default currentVersion eager load needs current_version_id.
                ->without('currentVersion')
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
        );
    }

    /**
     * File count and total size per storage disk (the deferred `storage` prop group).
     *
     * @return list<array{disk: string, files_count: int, files_size_sum: int}>
     */
    public function fileStatsByDisk(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:file-stats-by-disk',
            $now->copy()->addSeconds(60),
            fn (): array => File::query()
                // Aggregate rows, not files: skip the default currentVersion eager load.
                ->without('currentVersion')
                ->where('type', FileTypeEnum::File)
                // raw-sql: reviewed — fixed aggregate/group-by analytics; no user identifiers in SQL
                ->selectRaw('disk, COUNT(*) as files_count, COALESCE(SUM(size), 0) as files_size_sum')
                ->groupBy('disk')
                ->orderBy('disk')
                ->get()
                ->map(fn ($row): array => [
                    'disk' => (string) $row->disk,
                    'files_count' => (int) $row->getAttribute('files_count'),
                    'files_size_sum' => (int) $row->getAttribute('files_size_sum'),
                ])
                ->all(),
        );
    }

    /**
     * Bytes added per day over the last 14 days, zero-filled; cached for an hour.
     *
     * @return list<array{date: string, bytes_added: int}>
     */
    public function storageTrend(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:storage-trend:14d',
            $now->copy()->addHours(1),
            function () use ($now): array {
                $days = 14;
                $startDate = $now->copy()->startOfDay()->subDays($days - 1);

                // Aggregate rows, not files: skip the default currentVersion eager load.
                $bytesAddedByDate = File::query()
                    ->without('currentVersion')
                    ->where('type', FileTypeEnum::File)
                    ->where('created_at', '>=', $startDate)
                    // raw-sql: reviewed — fixed aggregate/group-by analytics; no user identifiers in SQL
                    ->selectRaw('DATE(created_at) as date, COALESCE(SUM(size), 0) as bytes_added')
                    ->groupBy('date')
                    ->orderBy('date')
                    ->get()
                    ->mapWithKeys(fn ($row): array => [(string) $row->getAttribute('date') => (int) $row->getAttribute('bytes_added')])
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
        );
    }

    /**
     * Every collection with its item count, ordered by name.
     *
     * @return list<array{id: int, name: string, slug: string, items_count: int}>
     */
    public function collectionCounts(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:collection-counts',
            $now->copy()->addSeconds(60),
            fn (): array => Collection::query()
                ->withCount('items')
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->map(fn (Collection $collection): array => [
                    'id' => $collection->id,
                    'name' => $collection->name,
                    'slug' => $collection->slug,
                    'items_count' => (int) $collection->items_count,
                ])
                ->all(),
        );
    }

    /**
     * Activity-log entries per day over the last 30 days, zero-filled.
     *
     * @return list<array{date: string, count: int}>
     */
    public function activityOverTime(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:activity-over-time:30d',
            $now->copy()->addSeconds(60),
            function () use ($now): array {
                $days = 30;
                $startDate = $now->copy()->startOfDay()->subDays($days - 1);

                $countsByDate = Activity::query()
                    ->where('created_at', '>=', $startDate)
                    // raw-sql: reviewed — fixed aggregate/group-by analytics; no user identifiers in SQL
                    ->selectRaw('DATE(created_at) as date, COUNT(*) as activity_count')
                    ->groupBy('date')
                    ->orderBy('date')
                    ->get()
                    ->mapWithKeys(fn ($row): array => [(string) $row->getAttribute('date') => (int) $row->getAttribute('activity_count')])
                    ->all();

                $series = [];
                for ($dayOffset = 0; $dayOffset < $days; $dayOffset++) {
                    $date = $startDate->copy()->addDays($dayOffset)->toDateString();
                    $series[] = [
                        'date' => $date,
                        'count' => (int) ($countsByDate[$date] ?? 0),
                    ];
                }

                return $series;
            },
        );
    }

    /**
     * Created, updated and deleted content-item events over the last 30 days.
     *
     * @return array{created: int, updated: int, deleted: int}
     */
    public function contentEventBreakdown(CarbonInterface $now): array
    {
        return Cache::remember(
            'dashboard:content-event-breakdown:30d',
            $now->copy()->addSeconds(60),
            function () use ($now): array {
                $startDate = $now->copy()->startOfDay()->subDays(29);

                $rows = Activity::query()
                    ->where('created_at', '>=', $startDate)
                    ->where('subject_type', CollectionItem::class)
                    ->whereIn('event', ['created', 'updated', 'deleted'])
                    // raw-sql: reviewed — fixed aggregate/group-by analytics; no user identifiers in SQL
                    ->selectRaw('event, COUNT(*) as event_count')
                    ->groupBy('event')
                    ->get()
                    ->mapWithKeys(fn ($row): array => [(string) $row->event => (int) $row->getAttribute('event_count')])
                    ->all();

                return [
                    'created' => (int) ($rows['created'] ?? 0),
                    'updated' => (int) ($rows['updated'] ?? 0),
                    'deleted' => (int) ($rows['deleted'] ?? 0),
                ];
            },
        );
    }
}
