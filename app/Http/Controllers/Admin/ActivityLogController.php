<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Requests\Concerns\ValidatesSearchQuery;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Models\User;
use App\Support\Activity\FilterableActivityEvents;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

/**
 * Admin activity log browser with user, event, and date filters.
 */
class ActivityLogController extends Controller
{
    use AuthorizesWithPermission;
    use ValidatesSearchQuery;

    /**
     * List activity log entries with optional filters for the admin index page.
     */
    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowActivityLogs->value);

        $search = $this->validatedSearch($request);
        $userIds = $this->resolvedUserIds($request);
        $event = $request->string('event')->toString();
        $logName = $request->string('log_name')->toString();
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();
        $subjectType = $request->string('subject_type')->trim()->toString();
        $subjectId = $request->integer('subject_id') ?: null;

        $query = Activity::query()
            ->with(['causer', 'subject'])
            ->latest('id');

        if ($userIds !== []) {
            $query->where('causer_type', (new User)->getMorphClass())
                ->whereIn('causer_id', $userIds);
        }

        if ($event !== '' && FilterableActivityEvents::isValid($event)) {
            $query->forEvent($event);
        }

        if ($logName !== '') {
            $query->inLog($logName);
        }

        if ($dateFrom !== '') {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        if ($subjectType !== '' && $subjectId !== null) {
            $query->where('subject_type', $subjectType)
                ->where('subject_id', $subjectId);
        }

        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('description', 'like', $term)
                    ->orWhere('subject_type', 'like', $term)
                    ->orWhere('event', 'like', $term);
            });
        }

        $activityLogs = $query
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
            'filters' => [
                'search' => $search,
                'user_ids' => $userIds,
                // Backward-compatible single id for deep links / older clients.
                'user_id' => count($userIds) === 1 ? $userIds[0] : null,
                'event' => FilterableActivityEvents::isValid($event) ? $event : '',
                'log_name' => $logName,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'subject_type' => $subjectType,
                'subject_id' => $subjectId,
            ],
        ]);
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
