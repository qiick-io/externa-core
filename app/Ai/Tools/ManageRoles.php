<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\DecodesToolJson;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Stringable;

class ManageRoles implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'List, get, create, update, or delete Spatie roles; sync permission names onto a role; list available permission names. Use list_permissions before creating a role with a permission set.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list' => $this->listRoles($request),
                'get' => $this->getRole($request),
                'create' => $this->createRole($request),
                'update' => $this->updateRole($request),
                'delete' => $this->deleteRole($request->integer('role_id')),
                'list_permissions' => $this->listPermissions($request),
                default => 'Error: Unknown action. Use list, get, create, update, delete, or list_permissions.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description(
                'list|get|create|update|delete|list_permissions'
            ),
            'role_id' => $schema->integer(),
            'name' => $schema->string()->description('Role name (slug-like, e.g. product-manager)'),
            'permission_names_json' => $schema->string()->description(
                'JSON array of permission names to sync, e.g. ["can-show-collections","can-create-collections"]'
            ),
            'query' => $schema->string(),
            'limit' => $schema->integer(),
        ];
    }

    private function listRoles(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowRoles)) {
            return $error;
        }

        $limit = min(max($request->integer('limit', 50), 1), 100);
        $query = Role::query()->withCount('permissions')->orderBy('name');

        if ($request->filled('query')) {
            $term = '%'.trim((string) $request->string('query')).'%';
            $query->where('name', 'like', $term);
        }

        $roles = $query->limit($limit)->get()->map(fn (Role $role): array => $this->serializeRole($role, false));

        return json_encode(['roles' => $roles], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function getRole(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowRoles)) {
            return $error;
        }

        $role = $this->findRole($request);

        if (is_string($role)) {
            return $role;
        }

        $role->load('permissions:id,name');

        return json_encode(['role' => $this->serializeRole($role, true)], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function createRole(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateRoles)) {
            return $error;
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: name is required.';
        }

        if ($name === RoleEnum::SuperAdmin->value) {
            return 'Error: You cannot create another super-admin role.';
        }

        $guard = config('auth.defaults.guard', 'web');

        $existing = Role::query()->where('name', $name)->where('guard_name', $guard)->first();

        // ponytail: upsert when the model retries create after a partial success
        $role = $existing ?? Role::query()->create([
            'name' => $name,
            'guard_name' => $guard,
        ]);

        $syncError = $this->syncPermissionsFromRequest($role, $request, required: false);

        if ($syncError !== null) {
            if ($existing === null) {
                $role->delete();
            }

            return $syncError;
        }

        $this->logAiMutation($role, $existing === null ? 'create_role' : 'update_role');
        $role->load('permissions:id,name');

        return json_encode([
            'ok' => true,
            'created' => $existing === null,
            'role' => $this->serializeRole($role, true),
            'url' => route('roles.edit', $role),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function updateRole(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditRoles)) {
            return $error;
        }

        $role = $this->findRole($request);

        if (is_string($role)) {
            return $role;
        }

        $renamed = false;

        if ($request->filled('name')) {
            $name = trim((string) $request->string('name'));

            if ($name === '') {
                return 'Error: name cannot be empty.';
            }

            if ($role->name === RoleEnum::SuperAdmin->value && $name !== RoleEnum::SuperAdmin->value) {
                return 'Error: The super-admin role cannot be renamed.';
            }

            if ($name === RoleEnum::SuperAdmin->value && $role->name !== RoleEnum::SuperAdmin->value) {
                return 'Error: You cannot rename a role to super-admin.';
            }

            $guard = $role->guard_name ?: config('auth.defaults.guard', 'web');

            if (Role::query()->where('name', $name)->where('guard_name', $guard)->whereKeyNot($role->id)->exists()) {
                return 'Error: A role with this name already exists.';
            }

            $role->update(['name' => $name]);
            $renamed = true;
        }

        $synced = $request->filled('permission_names_json');
        $syncError = $this->syncPermissionsFromRequest($role, $request, required: false);

        if ($syncError !== null) {
            return $syncError;
        }

        if (! $renamed && ! $synced) {
            return 'Error: Provide name and/or permission_names_json to update.';
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->logAiMutation($role, 'update_role');
        $role->load('permissions:id,name');

        return json_encode([
            'ok' => true,
            'role' => $this->serializeRole($role->fresh(['permissions:id,name']), true),
            'url' => route('roles.edit', $role),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function deleteRole(int $roleId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteRoles)) {
            return $error;
        }

        $role = Role::query()->find($roleId);

        if ($role === null) {
            return 'Error: Role not found.';
        }

        if ($role->name === RoleEnum::SuperAdmin->value) {
            return 'Error: The super-admin role cannot be deleted.';
        }

        $summary = $this->serializeRole($role, false);
        $this->logAiMutation($role, 'delete_role');
        $role->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function listPermissions(Request $request): string
    {
        $user = $this->authenticatedUser();

        if ($user === null) {
            return 'Error: Non autenticato.';
        }

        $resolver = app(EffectivePermissionResolver::class);
        $canList = $resolver->hasPermission($user, PermissionEnum::CanShowPermissions->value)
            || $resolver->hasPermission($user, PermissionEnum::CanCreateRoles->value)
            || $resolver->hasPermission($user, PermissionEnum::CanEditRoles->value);

        if (! $canList) {
            return 'Error: Permesso mancante (can-show-permissions|can-create-roles|can-edit-roles). Non puoi eseguire questa operazione.';
        }

        $limit = min(max($request->integer('limit', 200), 1), 500);
        $query = Permission::query()->orderBy('name');

        if ($request->filled('query')) {
            $term = '%'.trim((string) $request->string('query')).'%';
            $query->where('name', 'like', $term);
        }

        $permissions = $query->limit($limit)->get(['id', 'name']);

        return json_encode([
            'permissions' => $permissions,
            'hint' => 'Use these exact name values in permission_names_json when creating/updating roles.',
        ], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function findRole(Request $request): Role|string
    {
        if ($request->filled('role_id')) {
            $role = Role::query()->find($request->integer('role_id'));

            return $role ?? 'Error: Role not found.';
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: role_id or name is required.';
        }

        $role = Role::query()
            ->where('name', $name)
            ->where('guard_name', config('auth.defaults.guard', 'web'))
            ->first();

        return $role ?? 'Error: Role not found.';
    }

    private function syncPermissionsFromRequest(Role $role, Request $request, bool $required): ?string
    {
        $decoded = DecodesToolJson::optionalArrayFrom($request, 'permission_names_json');

        if (is_string($decoded)) {
            return $decoded;
        }

        if ($decoded === null) {
            return $required ? 'Error: permission_names_json is required.' : null;
        }

        foreach ($decoded as $value) {
            if (! is_string($value) || trim($value) === '') {
                return 'Error: permission_names_json must contain only non-empty strings.';
            }
        }

        $names = collect($decoded)
            ->map(fn (string $value): string => trim($value))
            ->unique()
            ->values();

        $permissions = Permission::query()->whereIn('name', $names->all())->get();

        if ($permissions->count() !== $names->count()) {
            $found = $permissions->pluck('name')->all();
            $missing = $names->diff($found)->values()->all();

            return 'Error: One or more permission names are invalid: '.implode(', ', $missing);
        }

        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeRole(Role $role, bool $withPermissions): array
    {
        $payload = [
            'id' => $role->id,
            'name' => $role->name,
            'guard_name' => $role->guard_name,
            'permissions_count' => $role->permissions_count ?? $role->permissions()->count(),
        ];

        if ($withPermissions) {
            $payload['permissions'] = $role->permissions
                ->pluck('name')
                ->values()
                ->all();
        }

        return $payload;
    }
}
