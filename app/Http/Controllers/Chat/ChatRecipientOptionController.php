<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ListChatDirectoryRequest;
use App\Models\Chat;
use App\Models\User;
use App\Models\UserGroup;
use App\Traits\PaginatesChatOptionRowsTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Hub option search for direct-chat recipients: users, groups and the merged
 * user + group directory.
 */
class ChatRecipientOptionController extends Controller
{
    use PaginatesChatOptionRowsTrait;

    public function users(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(Gate::forUser($user)->allows('createDirect', Chat::class), 403);

        $q = trim((string) $request->query('q', ''));
        $rows = User::query()
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.$q.'%';
                $query->where(function ($inner) use ($like): void {
                    $inner->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('first_name')
            ->limit(20)
            ->get(['id', 'first_name', 'last_name', 'email']);

        return response()->json([
            'users' => $rows->map(fn (User $row): array => [
                'id' => $row->id,
                'name' => trim($row->name) !== '' ? $row->name : $row->email,
                'email' => $row->email,
            ])->all(),
        ]);
    }

    public function groups(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(Gate::forUser($user)->allows('createDirect', Chat::class), 403);

        $q = trim((string) $request->query('q', ''));
        $rows = UserGroup::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name']);

        return response()->json([
            'groups' => $rows->map(fn (UserGroup $row): array => [
                'id' => $row->id,
                'name' => $row->name,
            ])->all(),
        ]);
    }

    public function directory(ListChatDirectoryRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $q = trim((string) ($validated['q'] ?? ''));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 25);

        $users = User::query()
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.$q.'%';
                $query->where(function ($inner) use ($like): void {
                    $inner->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email'])
            ->map(function (User $row): array {
                $name = trim($row->name) !== '' ? $row->name : $row->email;

                return [
                    'type' => 'user',
                    'id' => (int) $row->id,
                    'name' => $name,
                    'email' => $row->email,
                    'first_name' => (string) $row->first_name,
                    'last_name' => (string) ($row->last_name ?? ''),
                    'sort' => mb_strtolower($name),
                ];
            });

        $groups = UserGroup::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (UserGroup $row): array => [
                'type' => 'group',
                'id' => (int) $row->id,
                'name' => $row->name,
                'sort' => mb_strtolower($row->name),
            ]);

        // ponytail: merge users+groups in memory. Ceiling: large directories; upgrade: SQL UNION + paginate.
        $rows = $users->concat($groups)
            ->sortBy('sort')
            ->values()
            ->map(function (array $row): array {
                unset($row['sort']);

                return $row;
            })
            ->all();

        return response()->json($this->paginateRows($rows, $page, $perPage));
    }
}
