<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\CollectionPermissionAction;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionGuard;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;

trait AuthorizesCollectionAccess
{
    protected function apiAccess(Request $request): ApiAccess
    {
        $access = $request->attributes->get('apiAccess');
        if ($access instanceof ApiAccess) {
            return $access;
        }

        return app(ApiAccess::class);
    }

    protected function authorizeCollection(
        Request $request,
        Collection $collection,
        CollectionPermissionAction $action,
    ): void {
        $access = $this->apiAccess($request);
        $allowed = app(CollectionPermissionGuard::class)->allows(
            $access->roleId(),
            (int) $collection->id,
            $action,
        );

        if (! $allowed) {
            abort(403, 'This action is unauthorized for the collection.');
        }
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
