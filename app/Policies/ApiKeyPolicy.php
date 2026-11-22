<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Auth\Access\Response;

/**
 * Admin decisions on project API keys (Settings → API keys).
 *
 * Each ability requires the same permission as its `permission:` route middleware;
 * super-admins pass through the resolver. Any key manager may rotate or revoke any key,
 * whoever owns it; only an active key can be rotated (a revoked or expired one stays dead).
 * Every ability needs a session user: an API key never manages keys.
 *
 * An OAuth grant row (#802) is not an API key: it is neither listed, rotated nor revoked here.
 * Rotating one would mint a bearer secret for a grant that has none. Its owner revokes it under
 * Settings → Connected apps ({@see self::revokeGrant()}).
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
        return ! $apiKey->isOAuthGrant()
            && $apiKey->isActive()
            && $this->hasPermission($user, PermissionEnum::CanManageApiKeys);
    }

    public function delete(?User $user, ApiKey $apiKey): bool
    {
        return ! $apiKey->isOAuthGrant() && $this->hasPermission($user, PermissionEnum::CanManageApiKeys);
    }

    /**
     * A user revokes their own OAuth grants (#802), and needs no permission for it: someone whose
     * AI access was taken away must still be able to disconnect a client. Anyone else's grant, or
     * an API key, is not found here.
     */
    public function revokeGrant(?User $user, ApiKey $apiKey): Response
    {
        return $user !== null && $apiKey->isOAuthGrant() && $apiKey->owner_id === $user->id
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    private function hasPermission(?User $user, PermissionEnum $permission): bool
    {
        return $user !== null && $this->permissionResolver->hasPermission($user, $permission->value);
    }
}
