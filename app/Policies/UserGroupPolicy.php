<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Authorization\SuperAdminGuardService;

/**
 * Admin decisions on user groups.
 *
 * Each ability requires the same permission as its `permission:` route middleware
 * (super-admins pass through the resolver). Record abilities also keep groups that
 * grant the super-admin role out of reach of delegated administrators: without this,
 * a group manager could add themselves to such a group and inherit super-admin.
 * Callers render a denial as a bare 403 (web) or their own error string (AI tools).
 */
final class UserGroupPolicy
{
    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
        private readonly SuperAdminGuardService $superAdminGuard,
    ) {}

    public function viewAny(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanShowGroups);
    }

    public function create(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanCreateGroups);
    }

    public function update(?User $user, UserGroup $group): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanEditGroups)
            && $this->canTouch($user, $group);
    }

    public function delete(?User $user, UserGroup $group): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanDeleteGroups)
            && $this->canTouch($user, $group);
    }

    public function restore(?User $user, UserGroup $group): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanRestoreGroups)
            && $this->canTouch($user, $group);
    }

    public function forceDelete(?User $user, UserGroup $group): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanForceDeleteGroups)
            && $this->canTouch($user, $group);
    }

    private function hasPermission(?User $user, PermissionEnum $permission): bool
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value);
    }

    /**
     * Groups that grant super-admin are managed by super-admins only.
     */
    private function canTouch(?User $user, UserGroup $group): bool
    {
        return $this->superAdminGuard->canManageSuperAdmins($user)
            || ! $this->superAdminGuard->hasSuperAdminGroup([$group->id]);
    }
}
