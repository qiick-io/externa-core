<?php

declare(strict_types=1);

namespace App\Services\Authorization;

use App\Enums\RoleEnum;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Permission\Models\Role;

/**
 * Keeps the super-admin role out of reach of delegated administrators.
 *
 * `can-edit-users` / `can-edit-groups` holders may manage ordinary accounts, but
 * granting super-admin (directly or through a group), or editing / deleting an
 * existing super-admin, requires the acting user to be a super-admin. Without
 * this guard any user manager could promote themselves past `Gate::before`.
 */
class SuperAdminGuardService
{
    public function __construct(private EffectivePermissionResolver $permissionResolver) {}

    /**
     * Whether the actor may grant, revoke, or manage super-admin access.
     */
    public function canManageSuperAdmins(?User $actor): bool
    {
        return $actor !== null && $this->permissionResolver->isSuperAdmin($actor);
    }

    /**
     * Whether the actor is blocked from editing or deleting the target account.
     */
    public function isProtectedFrom(?User $actor, User $target): bool
    {
        return ! $this->canManageSuperAdmins($actor) && $this->permissionResolver->isSuperAdmin($target);
    }

    /**
     * Whether any of the given role ids is the super-admin role.
     *
     * @param  array<int, mixed>  $roleIds
     */
    public function includesSuperAdminRole(array $roleIds): bool
    {
        return Role::query()
            ->whereIn('id', $this->integerIds($roleIds))
            ->where('name', RoleEnum::SuperAdmin->value)
            ->exists();
    }

    /**
     * Whether any of the given role names is the super-admin role.
     *
     * @param  array<int, string>  $roleNames
     */
    public function includesSuperAdminRoleName(array $roleNames): bool
    {
        return in_array(RoleEnum::SuperAdmin->value, $roleNames, true);
    }

    /**
     * Whether any of the given groups (including soft-deleted ones) grants the super-admin role to its members.
     *
     * @param  array<int, mixed>  $groupIds
     */
    public function includesSuperAdminGroup(array $groupIds): bool
    {
        return UserGroup::withTrashed()
            ->whereIn('id', $this->integerIds($groupIds))
            ->whereHas('roles', fn (Builder $roleQuery) => $roleQuery->where('name', RoleEnum::SuperAdmin->value))
            ->exists();
    }

    /**
     * Whether any of the given users (including soft-deleted ones) is a super-admin, directly or via a group.
     *
     * @param  array<int, mixed>  $userIds
     */
    public function includesSuperAdminUser(array $userIds): bool
    {
        $isSuperAdminRole = fn (Builder $roleQuery) => $roleQuery->where('name', RoleEnum::SuperAdmin->value);

        return User::withTrashed()
            ->whereIn('id', $this->integerIds($userIds))
            ->where(fn (Builder $userQuery) => $userQuery
                ->whereHas('roles', $isSuperAdminRole)
                ->orWhereHas('groups.roles', $isSuperAdminRole))
            ->exists();
    }

    /**
     * @param  array<int, mixed>  $ids
     * @return list<int>
     */
    private function integerIds(array $ids): array
    {
        return array_values(array_map('intval', array_filter($ids, 'is_numeric')));
    }
}
