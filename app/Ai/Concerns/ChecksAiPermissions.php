<?php

namespace App\Ai\Concerns;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;

/**
 * Concern that enforces permission checks inside AI tool handlers.
 */
/**
 * Permission gate helpers for AI tools returning Italian error strings.
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
            return 'Error: Non autenticato.';
        }

        if (! app(EffectivePermissionResolver::class)->hasPermission($user, $permission->value)) {
            return 'Error: Permesso mancante ('.$permission->value.'). Non puoi eseguire questa operazione.';
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
