<?php

namespace App\Http\Controllers\Settings;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Redis;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\PermissionRegistrar;
use Throwable;

/**
 * Cache status and targeted flush actions for project operators.
 */
class PerformanceSettingsController extends Controller
{
    /**
     * Dashboard metric keys cached by DashboardController.
     *
     * @var list<string>
     */
    public const DASHBOARD_CACHE_KEYS = [
        'dashboard:latest-activity',
        'dashboard:file-stats',
        'dashboard:upload-health',
        'dashboard:most-active-users:24h',
        'dashboard:suspicious-events:1h',
        'dashboard:stuck-orphan-uploads',
        'dashboard:health',
        'dashboard:largest-files',
        'dashboard:file-stats-by-disk',
        'dashboard:storage-trend:14d',
        'dashboard:collection-counts',
        'dashboard:activity-over-time:30d',
        'dashboard:content-event-breakdown:30d',
    ];

    public function __construct(
        private readonly PublicApiResponseCache $publicApiResponseCache,
        private readonly CollectionPermissionGuard $collectionPermissionGuard,
        private readonly FilePermissionGuard $filePermissionGuard,
    ) {}

    /**
     * Render cache status and flush controls.
     */
    public function edit(): Response
    {
        $user = auth()->user();

        return Inertia::render('settings/performance', [
            'status' => [
                'cacheStore' => (string) config('cache.default'),
                'redisReachable' => $this->redisReachable(),
                'queueConnection' => (string) config('queue.default'),
                'appEnv' => app()->environment(),
                'appDebug' => (bool) config('app.debug'),
            ],
            'bootstrap' => $this->bootstrapCacheStatus(),
            'publicApi' => $this->publicApiStatus(),
            'links' => [
                'jobs' => $user?->can(PermissionEnum::CanShowJobs->value) ? url('/settings/jobs') : null,
                'pulse' => Gate::allows('viewPulse') ? url('/pulse') : null,
                'horizon' => Gate::allows('viewHorizon') ? url('/horizon') : null,
            ],
        ]);
    }

    /**
     * Bump the public API global epoch (all collections miss immediately).
     */
    public function flushPublicApi(): RedirectResponse
    {
        $actor = auth()->user();
        $actorId = $actor instanceof User ? (int) $actor->id : null;
        $this->publicApiResponseCache->bumpAll($actorId);

        activity()
            ->causedBy($actor)
            ->useLog('settings')
            ->event('public_api_cache_flushed')
            ->withProperties([
                'epoch' => $this->publicApiResponseCache->epoch(),
            ])
            ->log('Public API response cache flushed');

        return to_route('performance.edit')
            ->with('success', __('Public API response cache flushed.'));
    }

    /**
     * Drop cached collection/file permission matrices for every role.
     */
    public function flushPermissionMatrices(): RedirectResponse
    {
        $roleIds = Role::query()->pluck('id');

        foreach ($roleIds as $roleId) {
            $id = (int) $roleId;
            $this->collectionPermissionGuard->forget($id);
            $this->filePermissionGuard->forget($id);
        }

        return to_route('performance.edit')
            ->with('success', __('Permission matrices cache flushed.'));
    }

    /**
     * Clear Spatie's permission cache.
     */
    public function flushSpatiePermissions(): RedirectResponse
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return to_route('performance.edit')
            ->with('success', __('Spatie permission cache flushed.'));
    }

    /**
     * Forget dashboard metric cache keys.
     */
    public function flushDashboardMetrics(): RedirectResponse
    {
        foreach (self::DASHBOARD_CACHE_KEYS as $key) {
            Cache::forget($key);
        }

        return to_route('performance.edit')
            ->with('success', __('Dashboard metrics cache flushed.'));
    }

    /**
     * @return array{
     *     ttlSeconds: int,
     *     epoch: int,
     *     hits: int,
     *     misses: int,
     *     lastFlushedAt: string|null,
     *     lastFlushedBy: string|null
     * }
     */
    private function publicApiStatus(): array
    {
        $stats = $this->publicApiResponseCache->statsForCurrentEpoch();
        $flush = $this->publicApiResponseCache->lastFlushMeta();
        $flushedBy = null;
        if ($flush['by_user_id'] !== null) {
            $user = User::query()->find($flush['by_user_id']);
            if ($user instanceof User) {
                $flushedBy = $user->name !== ''
                    ? $user->name
                    : ($user->email ?? '#'.$user->id);
            }
        }

        return [
            'ttlSeconds' => $this->publicApiResponseCache->ttlSeconds(),
            'epoch' => $this->publicApiResponseCache->epoch(),
            'hits' => $stats['hits'],
            'misses' => $stats['misses'],
            'lastFlushedAt' => $flush['at'],
            'lastFlushedBy' => $flushedBy,
        ];
    }

    private function redisReachable(): bool
    {
        try {
            Redis::connection()->ping();

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * Check Laravel bootstrap cache file presence.
     *
     * @return array<string, bool>
     */
    private function bootstrapCacheStatus(): array
    {
        $basePath = base_path('bootstrap/cache');

        $routesFile = null;
        if (file_exists("{$basePath}/routes-v7.php")) {
            $routesFile = 'routes-v7.php';
        } elseif (file_exists("{$basePath}/routes.php")) {
            $routesFile = 'routes.php';
        } else {
            foreach (glob("{$basePath}/routes-v*.php") ?: [] as $file) {
                $routesFile = basename($file);
                break;
            }
        }

        return [
            'configCached' => file_exists("{$basePath}/config.php"),
            'routesCached' => $routesFile !== null,
            'eventsCached' => file_exists("{$basePath}/events.php"),
            'packagesCached' => file_exists("{$basePath}/packages.php"),
        ];
    }
}
