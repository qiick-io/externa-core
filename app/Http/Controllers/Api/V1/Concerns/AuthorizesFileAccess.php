<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\FilePermissionAction;
use App\Models\File;
use App\Services\Api\FilePermissionGuard;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

trait AuthorizesFileAccess
{
    protected function apiAccess(Request $request): ApiAccess
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $access;
        }

        return app(ApiAccess::class);
    }

    protected function authorizeFile(
        Request $request,
        FilePermissionAction $action,
    ): void {
        $access = $this->apiAccess($request);
        $allowed = app(FilePermissionGuard::class)->allows(
            $access->roleId(),
            $action,
        );

        if (! $allowed) {
            abort(403, 'This action is unauthorized for files.');
        }
    }

    /**
     * Require read (and read_private when the file is effectively private).
     */
    protected function authorizeFileRead(Request $request, File $file): void
    {
        $this->authorizeFile($request, FilePermissionAction::Read);

        $access = $this->apiAccess($request);
        if (! app(FilePermissionGuard::class)->canReadFile($access->roleId(), $file)) {
            abort(403, 'This action is unauthorized for files.');
        }
    }
}
