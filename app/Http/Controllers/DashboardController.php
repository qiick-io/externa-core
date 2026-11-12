<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Dashboard\DashboardOverviewMetricsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Renders the dashboard with cached operational and storage metrics.
 */
class DashboardController
{
    /**
     * The dashboard's views after the overview (`/dashboard/{view}`).
     *
     * @var list<string>
     */
    public const array VIEWS = ['health'];

    public function __construct(
        private readonly DashboardOverviewMetricsService $metrics,
    ) {}

    /**
     * Show recent activity, file stats, upload health, and deferred storage breakdowns.
     * `$view` is the tab: null for the overview, otherwise one of {@see self::VIEWS}.
     */
    public function index(Request $request, ?string $view = null): Response|RedirectResponse
    {
        // Links from before the tabs had their own URLs used `?tab=`.
        if ($view === null && in_array($request->query('tab'), self::VIEWS, true)) {
            return to_route('dashboard.view', ['view' => $request->query('tab')]);
        }

        $now = now();

        return Inertia::render('dashboard', [
            'view' => $view ?? 'overview',
            'latestActivity' => $this->metrics->latestActivity($now),
            'fileStats' => $this->metrics->fileStats($now),
            'uploadHealth' => $this->metrics->uploadHealth($now),
            'mostActiveUsers' => $this->metrics->mostActiveUsers($now),
            'suspiciousEvents' => $this->metrics->suspiciousEvents($now),
            'stuckOrphanUploads' => $this->metrics->stuckOrphanUploads($now),
            'health' => $this->metrics->health($now),
            'largestFiles' => $this->metrics->largestFiles($now),
            'fileStatsByDisk' => Inertia::defer(
                fn (): array => $this->metrics->fileStatsByDisk($now),
                'storage',
            ),
            'storageTrend' => $this->metrics->storageTrend($now),
            'collectionCounts' => $this->metrics->collectionCounts($now),
            'activityOverTime' => $this->metrics->activityOverTime($now),
            'contentEventBreakdown' => $this->metrics->contentEventBreakdown($now),
        ]);
    }
}
