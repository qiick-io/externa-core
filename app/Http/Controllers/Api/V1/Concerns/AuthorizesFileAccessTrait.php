<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Data\Api\ApiAccessData;
use App\Policies\FilePolicy;
use App\Services\Api\FileAccessEnforcerService;
use Illuminate\Http\Request;

/**
 * The Files API request's actor. Access rules live in {@see FileAccessEnforcerService} and
 * callers check them through {@see FilePolicy}.
 */
trait AuthorizesFileAccessTrait
{
    protected function apiAccess(Request $request): ApiAccessData
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccessData) {
            return $access;
        }

        return app(ApiAccessData::class);
    }
}
