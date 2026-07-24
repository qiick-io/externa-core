<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Lightweight queue monitor for pending jobs and failed_jobs retry/delete.
 */
class JobMonitorController extends Controller
{
    use AuthorizesWithPermission;

    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowJobs->value);

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

        return Inertia::render('admin/jobs/index', [
            'pending_count' => $pendingCount,
            'pending' => $pendingSample,
            'failed' => $failed,
            'can_manage' => app(EffectivePermissionResolver::class)
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
