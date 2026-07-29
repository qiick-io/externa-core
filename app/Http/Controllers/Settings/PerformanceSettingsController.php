<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Cache;
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
        return Inertia::render('settings/performance', [
            'cacheStore' => (string) config('cache.default'),
            'redisReachable' => $this->redisReachable(),
        ]);
    }

    /**
     * Bump the public API global epoch (all collections miss immediately).
     */
    public function flushPublicApi(): RedirectResponse
    {
        $this->publicApiResponseCache->bumpAll();

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

    private function redisReachable(): bool
    {
        try {
            Redis::connection()->ping();

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
