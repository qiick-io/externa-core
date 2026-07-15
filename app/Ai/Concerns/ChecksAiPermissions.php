<?php

namespace App\Ai\Concerns;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;

trait ChecksAiPermissions
{
    protected function requirePermission(PermissionEnum $permission): ?string
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return 'Error: Unauthenticated.';
        }

        if (! app(EffectivePermissionResolver::class)->hasPermission($user, $permission->value)) {
            return 'Error: Missing permission '.$permission->value.'.';
        }

        return null;
    }

    protected function authenticatedUser(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }
}
