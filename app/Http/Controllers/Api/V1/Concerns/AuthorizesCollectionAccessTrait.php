<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Policies\CollectionPolicy;
use App\Support\Api\ApiAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

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
     * Entry gate: role ACL ∩ API key scopes via {@see CollectionPolicy} (403 with its message).
     */
    protected function authorizeCollection(
        Request $request,
        Collection $collection,
        CollectionPermissionActionEnum $action,
    ): void {
        Gate::forUser($request->user())->authorize($action->itemsAbility(), $collection);
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
