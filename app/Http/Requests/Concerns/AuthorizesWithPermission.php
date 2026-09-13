<?php

namespace App\Http\Requests\Concerns;

use App\Services\Authorization\EffectivePermissionResolver;

/**
 * Shared helper for form requests that gate access on effective permissions.
 */
trait AuthorizesWithPermission
{
    /**
     * Abort with 403 when the current user lacks the given permission.
     */
    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();

        if ($user === null || ! app(EffectivePermissionResolver::class)->hasPermission($user, $permission)) {
            abort(403);
        }
    }
}
