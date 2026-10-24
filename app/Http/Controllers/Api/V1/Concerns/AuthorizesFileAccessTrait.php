<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\FilePermissionActionEnum;
use App\Models\ApiKey;
use App\Models\File;
use App\Services\Api\FilePermissionGuard;
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
     * collection_slugs do not apply to /api/v1/files (pending product decision).
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
    }
}
