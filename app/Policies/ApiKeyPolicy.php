<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;

/**
 * Admin decisions on project API keys (Settings → API keys).
 *
 * Each ability requires the same permission as its `permission:` route middleware;
 * super-admins pass through the resolver. Any key manager may rotate or revoke any key,
 * whoever owns it; only an active key can be rotated (a revoked or expired one stays dead).
 * Every ability needs a session user: an API key never manages keys.
 */
final class ApiKeyPolicy
{
    public function __construct(
        private readonly EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function viewAny(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanShowApiKeys);
    }

    public function create(?User $user): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanManageApiKeys);
    }

    public function rotate(?User $user, ApiKey $apiKey): bool
    {
        return $apiKey->isActive() && $this->hasPermission($user, PermissionEnum::CanManageApiKeys);
    }

    public function delete(?User $user, ApiKey $apiKey): bool
    {
        return $this->hasPermission($user, PermissionEnum::CanManageApiKeys);
    }

    private function hasPermission(?User $user, PermissionEnum $permission): bool
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value);
    }
}
