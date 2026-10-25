<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

trait AuthorizesCollectionAccessTrait
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
     * Entry gate: role ACL ∩ API key scopes via {@see CollectionPermissionEnforcer}.
     */
    protected function authorizeCollection(
        Request $request,
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): void {
        app(CollectionPermissionEnforcer::class)->assertCollectionAction(
            $request,
            $collection,
            $action,
        );
    }

    protected function findCollectionBySlug(string $slug): Collection
    {
        $collection = Collection::query()->where('slug', $slug)->first();
        if ($collection === null) {
            abort(404);
        }

        return $collection;
    }
}
