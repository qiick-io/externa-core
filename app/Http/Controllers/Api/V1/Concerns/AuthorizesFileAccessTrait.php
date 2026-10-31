<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\FilePermissionActionEnum;
use App\Models\File;
use App\Models\User;
use App\Services\Api\FilePermissionGuard;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

trait AuthorizesFileAccessTrait
{
    protected function apiAccess(Request $request): ApiAccess
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $access;
        }

        return app(ApiAccess::class);
    }

    /**
     * Role file ACL ∩ API key scopes (read_only blocks writes).
     *
     * Uses {@see ApiKey::allowsAction()} — same read_only rule as collections.
     * Explicit: {@see ApiKey::$collection_slugs} does not gate `/api/v1/files`
     * (files stay outside collection scopes; product may revisit later).
     */
    protected function authorizeFile(
        Request $request,
        FilePermissionActionEnum $action,
    ): void {
        $access = $this->apiAccess($request);
        $allowed = app(FilePermissionGuard::class)->allows(
            $access->roleId(),
            $action,
        );

        if (! $allowed) {
            abort(403, 'This action is unauthorized for files.');
        }

        $apiKey = $access->apiKey;
        if ($apiKey !== null && ! $apiKey->allowsAction($action)) {
            abort(403, 'This action is unauthorized for files.');
        }

        if ($apiKey !== null && $apiKey->owner_id !== null) {
            $owner = $apiKey->relationLoaded('owner') ? $apiKey->owner : $apiKey->owner()->first();
            if (! $owner instanceof User || ! $this->ownerAllowsFileAction($owner, $action)) {
                abort(403, 'This action is unauthorized for files.');
            }
        }
    }

    private function ownerAllowsFileAction(User $owner, FilePermissionActionEnum $action): bool
    {
        $resolver = app(EffectivePermissionResolver::class);
        if ($resolver->isSuperAdmin($owner)) {
            return true;
        }

        $guard = app(FilePermissionGuard::class);
        foreach ($resolver->effectiveRoleIds($owner) as $roleId) {
            if ($guard->allows($roleId, $action)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Require read (and read_private when the file is effectively private).
     */
    protected function authorizeFileRead(Request $request, File $file): void
    {
        $this->authorizeFile($request, FilePermissionActionEnum::Read);

        $access = $this->apiAccess($request);
        if (! app(FilePermissionGuard::class)->canReadFile($access->roleId(), $file)) {
            abort(403, 'This action is unauthorized for files.');
        }

        $apiKey = $access->apiKey;
        if ($apiKey !== null && $apiKey->owner_id !== null && $file->isEffectivelyPrivate()) {
            $owner = $apiKey->relationLoaded('owner') ? $apiKey->owner : $apiKey->owner()->first();
            if (
                ! $owner instanceof User
                || ! $this->ownerAllowsFileAction($owner, FilePermissionActionEnum::ReadPrivate)
            ) {
                abort(403, 'This action is unauthorized for files.');
            }
        }
    }
}
