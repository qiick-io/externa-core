<?php

namespace App\Ai\Concerns;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;

/**
 * Permission gate helpers for AI tools returning English machine-error strings.
 */
trait ChecksAiPermissions
{
    /**
     * Return an error string when the user lacks the permission, or null when allowed.
     */
    protected function requirePermission(PermissionEnum $permission): ?string
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return 'Error: Unauthenticated.';
        }

        if (! app(EffectivePermissionResolver::class)->hasPermission($user, $permission->value)) {
            return 'Error: Missing permission ('.$permission->value.'). You cannot perform this operation.';
        }

        return null;
    }

    /**
     * Authenticated user for tool execution, or null when guest.
     */
    protected function authenticatedUser(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }
}
