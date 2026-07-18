<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\DecodesToolJson;
use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Role;
use Stringable;

class ManageGroups implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'List, get, create, update, soft-delete, restore, or force-delete user groups; sync member user IDs and role names onto a group.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list' => $this->listGroups($request),
                'get' => $this->getGroup($request->integer('group_id')),
                'create' => $this->createGroup($request),
                'update' => $this->updateGroup($request),
                'delete' => $this->deleteGroup($request->integer('group_id')),
                'restore' => $this->restoreGroup($request->integer('group_id')),
                'force_delete' => $this->forceDeleteGroup($request->integer('group_id')),
                default => 'Error: Unknown action. Use list, get, create, update, delete, restore, or force_delete.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description(
                'list|get|create|update|delete|restore|force_delete'
            ),
            'group_id' => $schema->integer(),
            'name' => $schema->string(),
            'description' => $schema->string(),
            'user_ids_json' => $schema->string()->description('JSON array of user ids to sync as members'),
            'role_names_json' => $schema->string()->description('JSON array of role names to attach to the group'),
            'query' => $schema->string(),
            'limit' => $schema->integer(),
            'include_trashed' => $schema->boolean(),
        ];
    }

    private function listGroups(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowGroups)) {
            return $error;
        }

        $limit = min(max($request->integer('limit', 50), 1), 100);
        $query = $request->boolean('include_trashed')
            ? UserGroup::query()->withTrashed()
            : UserGroup::query();

        $query->with(['roles:id,name'])->withCount(['users', 'roles'])->latest('id');

        if ($request->filled('query')) {
            $term = '%'.trim((string) $request->string('query')).'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('name', 'like', $term)
                    ->orWhere('description', 'like', $term);
            });
        }

        $groups = $query->limit($limit)->get()->map(fn (UserGroup $group): array => $this->serializeGroup($group));

        return json_encode(['groups' => $groups], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function getGroup(int $groupId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowGroups)) {
            return $error;
        }

        $group = UserGroup::query()->withTrashed()->with(['roles:id,name', 'users:id,first_name,last_name,email'])->find($groupId);

        if ($group === null) {
            return 'Error: Group not found.';
        }

        return json_encode(['group' => $this->serializeGroup($group, true)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function createGroup(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateGroups)) {
            return $error;
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: name is required.';
        }

        $group = UserGroup::query()->create([
            'name' => $name,
            'description' => $this->nullableString($request, 'description'),
        ]);

        $memberError = $this->syncMembers($group, $request, required: false);

        if ($memberError !== null) {
            $group->forceDelete();

            return $memberError;
        }

        $roleError = $this->syncRoles($group, $request, required: false);

        if ($roleError !== null) {
            $group->forceDelete();

            return $roleError;
        }

        $this->logAiMutation($group, 'create_group');
        $group->load(['roles:id,name'])->loadCount(['users', 'roles']);

        return json_encode([
            'ok' => true,
            'group' => $this->serializeGroup($group),
            'url' => route('groups.index'),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateGroup(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditGroups)) {
            return $error;
        }

        $group = UserGroup::query()->find($request->integer('group_id'));

        if ($group === null) {
            return 'Error: Group not found.';
        }

        $attributes = [];

        if ($request->filled('name')) {
            $attributes['name'] = trim((string) $request->string('name'));
        }

        if ($request->has('description')) {
            $attributes['description'] = $this->nullableString($request, 'description');
        }

        if ($attributes !== []) {
            $group->update($attributes);
        }

        $syncedMembers = $request->filled('user_ids_json');
        $memberError = $this->syncMembers($group, $request, required: false);

        if ($memberError !== null) {
            return $memberError;
        }

        $syncedRoles = $request->filled('role_names_json');
        $roleError = $this->syncRoles($group, $request, required: false);

        if ($roleError !== null) {
            return $roleError;
        }

        if ($attributes === [] && ! $syncedMembers && ! $syncedRoles) {
            return 'Error: Provide name, description, user_ids_json, and/or role_names_json to update.';
        }

        $this->logAiMutation($group, 'update_group');
        $fresh = $group->fresh(['roles:id,name']);
        $fresh?->loadCount(['users', 'roles']);

        return json_encode([
            'ok' => true,
            'group' => $this->serializeGroup($fresh ?? $group),
            'url' => route('groups.index'),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function deleteGroup(int $groupId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteGroups)) {
            return $error;
        }

        $group = UserGroup::query()->find($groupId);

        if ($group === null) {
            return 'Error: Group not found.';
        }

        $summary = $this->serializeGroup($group);
        $this->logAiMutation($group, 'delete_group');
        $group->delete();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function restoreGroup(int $groupId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanRestoreGroups)) {
            return $error;
        }

        $group = UserGroup::query()->onlyTrashed()->find($groupId);

        if ($group === null) {
            return 'Error: Trashed group not found.';
        }

        $group->restore();
        $this->logAiMutation($group, 'restore_group');
        $group->load(['roles:id,name'])->loadCount(['users', 'roles']);

        return json_encode(['ok' => true, 'group' => $this->serializeGroup($group)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function forceDeleteGroup(int $groupId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanForceDeleteGroups)) {
            return $error;
        }

        $group = UserGroup::query()->onlyTrashed()->find($groupId);

        if ($group === null) {
            return 'Error: Trashed group not found.';
        }

        $summary = $this->serializeGroup($group);
        $this->logAiMutation($group, 'force_delete_group');
        $group->forceDelete();

        return json_encode(['ok' => true, 'force_deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function syncMembers(UserGroup $group, Request $request, bool $required): ?string
    {
        $decoded = DecodesToolJson::optionalArrayFrom($request, 'user_ids_json');

        if (is_string($decoded)) {
            return $decoded;
        }

        if ($decoded === null) {
            return $required ? 'Error: user_ids_json is required.' : null;
        }

        $ids = collect($decoded)
            ->filter(fn ($value): bool => is_int($value) || (is_string($value) && ctype_digit($value)))
            ->map(fn ($value): int => (int) $value)
            ->unique()
            ->values();

        if ($ids->count() !== count($decoded)) {
            return 'Error: user_ids_json must contain only integer user ids.';
        }

        $found = User::query()->whereIn('id', $ids->all())->pluck('id');

        if ($found->count() !== $ids->count()) {
            return 'Error: One or more user ids are invalid.';
        }

        $group->users()->sync($ids->all());

        return null;
    }

    private function syncRoles(UserGroup $group, Request $request, bool $required): ?string
    {
        $decoded = DecodesToolJson::optionalArrayFrom($request, 'role_names_json');

        if (is_string($decoded)) {
            return $decoded;
        }

        if ($decoded === null) {
            return $required ? 'Error: role_names_json is required.' : null;
        }

        foreach ($decoded as $value) {
            if (! is_string($value) || trim($value) === '') {
                return 'Error: role_names_json must contain only non-empty strings.';
            }
        }

        $names = collect($decoded)->map(fn (string $value): string => trim($value))->unique()->values();
        $roles = Role::query()->whereIn('name', $names->all())->get();

        if ($roles->count() !== $names->count()) {
            $missing = $names->diff($roles->pluck('name'))->values()->all();

            return 'Error: One or more role names are invalid: '.implode(', ', $missing);
        }

        $group->roles()->sync($roles->modelKeys());

        return null;
    }

    private function nullableString(Request $request, string $key): ?string
    {
        $value = trim((string) $request->string($key));

        return $value !== '' ? $value : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeGroup(UserGroup $group, bool $withMembers = false): array
    {
        $payload = [
            'id' => $group->id,
            'name' => $group->name,
            'description' => $group->description,
            'deleted_at' => $group->deleted_at?->toIso8601String(),
            'users_count' => $group->users_count ?? $group->users()->count(),
            'roles_count' => $group->roles_count ?? $group->roles()->count(),
            'roles' => $group->relationLoaded('roles')
                ? $group->roles->pluck('name')->values()->all()
                : [],
        ];

        if ($withMembers && $group->relationLoaded('users')) {
            $payload['users'] = $group->users->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => trim("{$user->first_name} {$user->last_name}"),
                'email' => $user->email,
            ])->values()->all();
        }

        return $payload;
    }
}
