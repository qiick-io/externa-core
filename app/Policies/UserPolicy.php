<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Authorization\SuperAdminGuardService;

/**
 * Admin decisions on user accounts.
 *
 * Each ability requires the same permission as its `permission:` route middleware
 * (super-admins pass through the resolver). Record abilities also keep super-admin
 * accounts out of reach of delegated administrators: only a super-admin may edit,
 * delete, restore or force-delete one ({@see SuperAdminGuardService::isProtectedFrom()}).
 * Callers render a denial as a bare 403 (web) or their own error string (AI tools).
 */
final class UserPolicy
{
    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
        private readonly SuperAdminGuardService $superAdminGuard,
    ) {}

    public function viewAny(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanShowUsers);
    }

    public function create(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanCreateUsers);
    }

    public function update(?User $user, User $targetUser): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanEditUsers)
            && $this->canTouch($user, $targetUser);
    }

    public function delete(?User $user, User $targetUser): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanDeleteUsers)
            && $this->canTouch($user, $targetUser);
    }

    public function restore(?User $user, User $targetUser): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanRestoreUsers)
            && $this->canTouch($user, $targetUser);
    }

    public function forceDelete(?User $user, User $targetUser): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanForceDeleteUsers)
            && $this->canTouch($user, $targetUser);
    }

    private function hasPermission(?User $user, PermissionEnum $permission): bool
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value);
    }

    /**
     * Super-admin accounts are managed by super-admins only.
     */
    private function canTouch(?User $user, User $targetUser): bool
    {
        return ! $this->superAdminGuard->isProtectedFrom($user, $targetUser);
    }
}
