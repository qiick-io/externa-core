<?php

namespace App\Services\Authorization;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use Spatie\Permission\Models\Permission;

/**
 * Resolves effective permissions and roles from direct assignment and group inheritance.
 */
class EffectivePermissionResolver
{
    /**
     * @var array<int, array{permissions: list<string>, role_names: list<string>, role_ids: list<int>}>
     */
    private array $cache = [];

    /**
     * Flat list of permission names effective for the user.
     *
     * @return list<string>
     */
    public function permissionsFor(User $user): array
    {
        return $this->resolve($user)['permissions'];
    }

    /**
     * Whether the user has the given permission; super-admin always passes.
     */
    public function hasPermission(User $user, string $permission): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        return in_array($permission, $this->permissionsFor($user), true);
    }

    /**
     * @return list<string>
     */
    public function roleNamesFor(User $user): array
    {
        return $this->resolve($user)['role_names'];
    }

    /**
     * Role ids from direct assignment ∪ roles attached via the user's groups.
     *
     * @return list<int>
     */
    public function effectiveRoleIds(User $user): array
    {
        return $this->resolve($user)['role_ids'];
    }

    /**
     * Whether the user holds the super-admin role via direct or group roles.
     */
    public function isSuperAdmin(User $user): bool
    {
        return in_array(RoleEnum::SuperAdmin->value, $this->roleNamesFor($user), true);
    }

    /**
     * Clear cached resolution for one user or the entire cache.
     */
    public function forget(?User $user = null): void
    {
        if ($user === null) {
            $this->cache = [];

            return;
        }

        unset($this->cache[$user->id]);
    }

    /**
     * @return array{permissions: list<string>, role_names: list<string>, role_ids: list<int>}
     */
    private function resolve(User $user): array
    {
        if (isset($this->cache[$user->id])) {
            return $this->cache[$user->id];
        }

        $directRoles = $user->roles()->select('roles.id', 'roles.name')->get();
        $groupRoles = $user->groups()
            ->with('roles:id,name')
            ->get()
            ->flatMap(fn ($group) => $group->roles);

        $mergedRoles = $directRoles
            ->concat($groupRoles)
            ->unique('id')
            ->values();

        $roleNames = $mergedRoles
            ->pluck('name')
            ->unique()
            ->sort()
            ->values()
            ->all();

        $roleIds = $mergedRoles
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->sort()
            ->values()
            ->all();

        if (in_array(RoleEnum::SuperAdmin->value, $roleNames, true)) {
            $permissions = PermissionEnum::values();
        } else {
            $directPermissionNames = $user->getAllPermissions()->pluck('name');

            $groupPermissionNames = Permission::query()
                ->whereHas('roles', function ($query) use ($user): void {
                    $query->whereIn('roles.id', function ($subQuery) use ($user): void {
                        $subQuery->select('user_group_role.role_id')
                            ->from('user_group_role')
                            ->join('user_group_user', 'user_group_user.user_group_id', '=', 'user_group_role.user_group_id')
                            ->where('user_group_user.user_id', $user->id);
                    });
                })
                ->pluck('name');

            $permissions = $directPermissionNames
                ->merge($groupPermissionNames)
                ->unique()
                ->sort()
                ->values()
                ->all();
        }

        return $this->cache[$user->id] = [
            'permissions' => $permissions,
            'role_names' => $roleNames,
            'role_ids' => $roleIds,
        ];
    }
}
