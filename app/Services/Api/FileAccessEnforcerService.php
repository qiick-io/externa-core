<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Enums\FilePermissionActionEnum;
use App\Models\ApiKey;
use App\Models\File;
use App\Models\User;
use App\Policies\FilePolicy;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Support\Api\ApiAccess;

/**
 * Files API access for an API actor (public role or API key): role file ACL ∩ API key scopes ∩
 * owner ceiling.
 *
 * {@see ApiKey::$collection_slugs} does not gate files; {@see ApiKey::$files_scope} and
 * `read_only` do ({@see ApiKey::allowsFileAction()}). An owned key never exceeds what its owner's
 * roles grant, `read_private` included. Session users are not judged here: the admin file manager
 * uses the Spatie file permissions ({@see FilePolicy}).
 */
final class FileAccessEnforcerService
{
    public function __construct(
        private FilePermissionGuardService $guard,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function allowsFileAction(ApiAccess $access, FilePermissionActionEnum $action): bool
    {
        if (! $this->guard->allows($access->roleId(), $action)) {
            return false;
        }

        $apiKey = $access->apiKey;
        if ($apiKey !== null && ! $apiKey->allowsFileAction($action)) {
            return false;
        }

        if ($apiKey !== null && $apiKey->owner_id !== null) {
            $owner = $this->owner($apiKey);

            return $owner instanceof User && $this->ownerAllowsFileAction($owner, $action);
        }

        return true;
    }

    /**
     * Read access to one file: `read`, plus `read_private` (role and owner) when the file is
     * effectively private.
     */
    public function allowsFileRead(ApiAccess $access, File $file): bool
    {
        if (! $this->allowsFileAction($access, FilePermissionActionEnum::Read)) {
            return false;
        }

        if (! $this->guard->canReadFile($access->roleId(), $file)) {
            return false;
        }

        $apiKey = $access->apiKey;
        if ($apiKey !== null && $apiKey->owner_id !== null && $file->isEffectivelyPrivate()) {
            $owner = $this->owner($apiKey);

            return $owner instanceof User
                && $this->ownerAllowsFileAction($owner, FilePermissionActionEnum::ReadPrivate);
        }

        return true;
    }

    private function owner(ApiKey $apiKey): ?User
    {
        return $apiKey->relationLoaded('owner') ? $apiKey->owner : $apiKey->owner()->first();
    }

    /**
     * Owner ceiling: super-admin, or any of the owner's effective roles granting the action.
     */
    private function ownerAllowsFileAction(User $owner, FilePermissionActionEnum $action): bool
    {
        if ($this->permissionResolver->isSuperAdmin($owner)) {
            return true;
        }

        foreach ($this->permissionResolver->effectiveRoleIds($owner) as $roleId) {
            if ($this->guard->allows($roleId, $action)) {
                return true;
            }
        }

        return false;
    }
}
