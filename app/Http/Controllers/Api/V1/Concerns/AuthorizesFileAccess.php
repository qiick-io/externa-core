<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\FilePermissionAction;
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
}
