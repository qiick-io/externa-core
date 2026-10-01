<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Requests\Concerns\ValidatesSearchQuery;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Models\User;
use App\Support\Activity\FilterableActivityEvents;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Admin activity log browser with user, event, and date filters.
 */
class ActivityLogController extends Controller
{
    use AuthorizesWithPermission;
    use ValidatesSearchQuery;

    /**
     * ponytail: sync stream cap — queue/zip export if product needs >10k rows.
     */
    private const EXPORT_ROW_LIMIT = 10_000;

    /**
     * List activity log entries with optional filters for the admin index page.
     */
    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowActivityLogs->value);

        $filters = $this->resolvedFilters($request);

        $activityLogs = $this->filteredQuery($filters)
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        $users = User::query()
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->limit(100)
            ->get(['id', 'first_name', 'last_name', 'email'])
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
            ])
            ->values()
            ->all();

        return Inertia::render('admin/activity-logs/index', [
            'activityLogs' => ActivityLogResource::collection($activityLogs),
            'users' => $users,
            'events' => FilterableActivityEvents::all(),
            'logNames' => ['default', 'auth', 'ai', 'chat', 'settings'],
            'filters' => $filters,
            'exportRowLimit' => self::EXPORT_ROW_LIMIT,
        ]);
    }

    /**
     * Stream filtered activity logs as CSV or JSON (same filters as index).
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorizePermission(PermissionEnum::CanShowActivityLogs->value);

        $format = strtolower($request->string('format')->toString());
        if (! in_array($format, ['csv', 'json'], true)) {
            $format = 'csv';
        }

        $filters = $this->resolvedFilters($request);
        $query = $this->filteredQuery($filters)->limit(self::EXPORT_ROW_LIMIT);
        $stamp = now()->format('Y-m-d-His');
        $filename = "activity-logs-{$stamp}.{$format}";

        if ($format === 'json') {
            return response()->streamDownload(function () use ($query): void {
                echo '[';
                $first = true;
                foreach ($query->cursor() as $activity) {
                    /** @var Activity $activity */
                    if (! $first) {
                        echo ',';
                    }
                    $first = false;
                    echo json_encode($this->exportRow($activity), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
                echo ']';
            }, $filename, [
                'Content-Type' => 'application/json; charset=UTF-8',
            ]);
        }

        return response()->streamDownload(function () use ($query): void {
            $out = fopen('php://output', 'w');
            if ($out === false) {
                return;
            }

            // UTF-8 BOM for Excel
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'id',
                'created_at',
                'log_name',
                'event',
                'description',
                'causer_id',
                'causer_email',
                'subject_type',
                'subject_id',
                'properties',
            ]);

            foreach ($query->cursor() as $activity) {
                /** @var Activity $activity */
                $row = $this->exportRow($activity);
                fputcsv($out, [
                    $row['id'],
                    $row['created_at'],
                    $row['log_name'],
                    $row['event'],
                    $row['description'],
                    $row['causer_id'],
                    $row['causer_email'],
                    $row['subject_type'],
                    $row['subject_id'],
                    $row['properties'],
                ]);
            }

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * @return array{
     *     search: string,
     *     user_ids: list<int>,
     *     user_id: int|null,
     *     event: string,
     *     log_name: string,
     *     date_from: string,
     *     date_to: string,
     *     subject_type: string,
     *     subject_id: int|null
     * }
     */
    private function resolvedFilters(Request $request): array
    {
        $search = $this->validatedSearch($request);
        $userIds = $this->resolvedUserIds($request);
        $event = $request->string('event')->toString();
        $logName = $request->string('log_name')->toString();
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $subjectType = $request->string('subject_type')->trim()->toString();
        $subjectId = $request->integer('subject_id') ?: null;

        return [
            'search' => $search,
            'user_ids' => $userIds,
            'user_id' => count($userIds) === 1 ? $userIds[0] : null,
            'event' => FilterableActivityEvents::isValid($event) ? $event : '',
            'log_name' => $logName,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
        ];
    }

    /**
     * @param  array{
     *     search: string,
     *     user_ids: list<int>,
     *     event: string,
     *     log_name: string,
     *     date_from: string,
     *     date_to: string,
     *     subject_type: string,
     *     subject_id: int|null
     * }  $filters
     * @return Builder<Activity>
     */
    private function filteredQuery(array $filters): Builder
    {
        $query = Activity::query()
            ->with(['causer', 'subject'])
            ->latest('id');

        if ($filters['user_ids'] !== []) {
            $query->where('causer_type', (new User)->getMorphClass())
                ->whereIn('causer_id', $filters['user_ids']);
        }

        if ($filters['event'] !== '') {
            $query->forEvent($filters['event']);
        }

        if ($filters['log_name'] !== '') {
            $query->inLog($filters['log_name']);
        }

        if ($filters['date_from'] !== '') {
            $query->whereDate('created_at', '>=', $filters['date_from']);
        }

        if ($filters['date_to'] !== '') {
            $query->whereDate('created_at', '<=', $filters['date_to']);
        }

        if ($filters['subject_type'] !== '' && $filters['subject_id'] !== null) {
            $query->where('subject_type', $filters['subject_type'])
                ->where('subject_id', $filters['subject_id']);
        }

        if ($filters['search'] !== '') {
            $term = '%'.$filters['search'].'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('description', 'like', $term)
                    ->orWhere('subject_type', 'like', $term)
                    ->orWhere('event', 'like', $term);
            });
        }

        return $query;
    }

    /**
     * @return array{
     *     id: int,
     *     created_at: string|null,
     *     log_name: string|null,
     *     event: string|null,
     *     description: string|null,
     *     causer_id: int|null,
     *     causer_email: string|null,
     *     subject_type: string|null,
     *     subject_id: int|null,
     *     properties: string
     * }
     */
    private function exportRow(Activity $activity): array
    {
        $causer = $activity->causer;
        $email = $causer instanceof User ? $causer->email : null;

        return [
            'id' => $activity->id,
            'created_at' => $activity->created_at?->toIso8601String(),
            'log_name' => $activity->log_name,
            'event' => $activity->event,
            'description' => $activity->description,
            'causer_id' => $activity->causer_id,
            'causer_email' => $email,
            'subject_type' => $activity->subject_type,
            'subject_id' => $activity->subject_id,
            'properties' => json_encode($activity->properties?->toArray() ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}',
        ];
    }

    /**
     * @return list<int>
     */
    private function resolvedUserIds(Request $request): array
    {
        $raw = $request->input('user_ids', $request->input('user_id'));

        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }

        $ids = is_array($raw) ? $raw : [$raw];

        return array_values(array_unique(array_filter(
            array_map('intval', $ids),
            fn (int $id): bool => $id > 0,
        )));
    }
}
