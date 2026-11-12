<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Auth\Access\Response;

/**
 * Admin decisions on roles.
 *
 * Each ability requires the same permission as its `permission:` route middleware
 * (super-admins pass through the resolver; a missing permission is a message-less deny).
 * Record abilities keep the super-admin role and locked system roles (`is_system`,
 * `public`) intact. These invariants bind super-admins too, so their denials carry
 * the message the admin UI shows.
 */
final class RolePolicy
{
    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function viewAny(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanShowRoles);
    }

    public function create(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanCreateRoles);
    }

    /**
     * Cloning the super-admin role or a locked system role is refused: a copy would
     * spread its special meaning to an ordinary, editable role.
     */
    public function duplicate(?User $user, Role $role): Response
    {
        if (! $this->hasPermission($user, PermissionEnum::CanCreateRoles)) {
            return Response::deny();
        }

        if ($this->isProtected($role)) {
            return Response::deny(__('This role cannot be duplicated.'));
        }

        return Response::allow();
    }

    /**
     * The super-admin role keeps its name (the name is what grants everything), and
     * locked system roles cannot be renamed. Updates that keep the name (no name, or
     * the same one) stay allowed, so their permissions and matrices remain editable.
     *
     * @param  mixed  $requestedName  The requested new name, or null when the update does not rename.
     */
    public function update(?User $user, Role $role, mixed $requestedName = null): Response
    {
        if (! $this->hasPermission($user, PermissionEnum::CanEditRoles)) {
            return Response::deny();
        }

        $isRename = $requestedName !== null && $requestedName !== $role->name;

        if ($role->name === RoleEnum::SuperAdmin->value && $isRename) {
            return Response::deny(__('The super-admin role cannot be renamed.'));
        }

        if ($role->isLockedSystemRole() && $isRename) {
            return Response::deny(__('System roles cannot be renamed.'));
        }

        return Response::allow();
    }

    public function delete(?User $user, Role $role): Response
    {
        if (! $this->hasPermission($user, PermissionEnum::CanDeleteRoles)) {
            return Response::deny();
        }

        if ($this->isProtected($role)) {
            return Response::deny(__('This role cannot be deleted.'));
        }

        return Response::allow();
    }

    private function hasPermission(?User $user, PermissionEnum $permission): bool
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value);
    }

    private function isProtected(Role $role): bool
    {
        return $role->name === RoleEnum::SuperAdmin->value || $role->isLockedSystemRole();
    }
}
