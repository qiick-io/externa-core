<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Policies\FilePolicy;
use App\Services\Api\FileAccessEnforcerService;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

/**
 * The Files API request's actor. Access rules live in {@see FileAccessEnforcerService} and
 * callers check them through {@see FilePolicy}.
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
}
