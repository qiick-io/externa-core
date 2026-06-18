<?php

namespace App\Http\Requests\Concerns;

use App\Services\Authorization\EffectivePermissionResolver;

trait AuthorizesWithPermission
{
    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();

        if ($user === null || ! app(EffectivePermissionResolver::class)->hasPermission($user, $permission)) {
            abort(403);
        }
    }
}
