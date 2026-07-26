<?php

namespace App\Support\Auth;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Resolve the first admin surface a user is allowed to open after login.
 */
final class HomePath
{
    /**
     * @return non-empty-string Absolute path (not a full URL).
     */
    public static function for(?Authenticatable $user): string
    {
        if ($user === null) {
            return '/login';
        }

        // Ordered by “default home” preference; first permitted wins.
        $candidates = [
            [PermissionEnum::CanShowDashboard, '/dashboard'],
            [PermissionEnum::CanShowFiles, '/files'],
            [PermissionEnum::CanShowCollections, '/collections'],
            [PermissionEnum::CanUseAi, '/ai'],
            [PermissionEnum::CanShowUsers, '/users'],
            [PermissionEnum::CanShowActivityLogs, '/activity-logs'],
        ];

        $resolver = app(EffectivePermissionResolver::class);

        foreach ($candidates as [$permission, $path]) {
            if ($user instanceof User && $resolver->hasPermission($user, $permission->value)) {
                return $path;
            }
        }

        // Authenticated users can always reach their profile settings.
        return '/settings/profile';
    }
}
