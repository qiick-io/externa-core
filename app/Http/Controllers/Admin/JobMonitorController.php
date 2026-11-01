<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Services\Admin\JobMonitorQueryService;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Lightweight queue monitor for pending jobs and failed_jobs retry/delete.
 */
class JobMonitorController extends Controller
{
    use AuthorizesWithPermissionTrait;

    public function index(Request $request, JobMonitorQueryService $jobs): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowJobs->value);

        $snapshot = $jobs->snapshot();

        return Inertia::render('admin/jobs/index', [
            'pending_count' => $snapshot['pending_count'],
            'pending' => $snapshot['pending'],
            'failed' => $snapshot['failed'],
            'can_manage' => app(EffectivePermissionResolverService::class)
                ->hasPermission($request->user(), PermissionEnum::CanManageJobs->value),
        ]);
    }

    public function retry(Request $request, string $uuid): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanManageJobs->value);

        try {
            Artisan::call('queue:retry', ['id' => [$uuid]]);
        } catch (\Throwable $e) {
            return redirect()->back()->with('error', __('Could not retry job: :message', [
                'message' => $e->getMessage(),
            ]));
        }

        return redirect()->back()->with('success', __('Job queued for retry.'));
    }

    public function destroy(Request $request, string $uuid): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanManageJobs->value);

        Artisan::call('queue:forget', ['id' => $uuid]);

        return redirect()->back()->with('success', __('Failed job deleted.'));
    }
}
