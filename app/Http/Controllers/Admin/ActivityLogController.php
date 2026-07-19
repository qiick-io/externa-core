<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\Admin\ActivityLogResource;
use App\Models\User;
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

    /**
     * @var list<string>
     */
    private const FILTERABLE_EVENTS = [
        'created',
        'updated',
        'deleted',
        'restored',
        'login',
        'logout',
        'failed',
        'ai_prompt',
        'ai_response',
        'ai_tool',
        'ai_mutation',
    ];

    /**
     * List activity log entries with optional filters for the admin index page.
     */
    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowActivityLogs->value);

        $search = $request->string('search')->trim()->toString();
        $userId = $request->integer('user_id') ?: null;
        $event = $request->string('event')->toString();
        $logName = $request->string('log_name')->toString();
        $dateFrom = $request->string('date_from')->toString();
        $dateTo = $request->string('date_to')->toString();

        $query = Activity::query()
            ->with(['causer', 'subject'])
            ->latest('id');

        if ($userId !== null) {
            $causer = User::query()->find($userId);

            if ($causer !== null) {
                $query->causedBy($causer);
            }
        }

        if ($event !== '' && in_array($event, self::FILTERABLE_EVENTS, true)) {
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
            'events' => self::FILTERABLE_EVENTS,
            'filters' => [
                'search' => $search,
                'user_id' => $userId,
                'event' => in_array($event, self::FILTERABLE_EVENTS, true) ? $event : '',
                'log_name' => $logName,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
        ]);
    }
}
