<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\FilePermissionActionEnum;
use App\Models\File;
use App\Policies\FilePolicy;
use App\Services\Api\FileAccessEnforcerService;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

/**
 * Files API gates for the request's API actor, aborting with 403. The rules live in
 * {@see FileAccessEnforcerService}; record checks go through {@see FilePolicy}.
 */
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
     * Role file ACL ∩ API key scopes ∩ owner ceiling.
     */
    protected function authorizeFile(
        Request $request,
        FilePermissionActionEnum $action,
    ): void {
        if (! app(FileAccessEnforcerService::class)->allowsFileAction($this->apiAccess($request), $action)) {
            abort(403, __('This action is unauthorized for files.'));
        }
    }

    /**
     * Require read (and read_private when the file is effectively private).
     */
    protected function authorizeFileRead(Request $request, File $file): void
    {
        if (! app(FileAccessEnforcerService::class)->allowsFileRead($this->apiAccess($request), $file)) {
            abort(403, __('This action is unauthorized for files.'));
        }
    }
}
