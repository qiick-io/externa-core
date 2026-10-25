<?php

namespace App\GraphQL\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionEnforcer;

trait AuthorizesGraphqlCollectionTrait
{
    protected function findCollection(string $slug): Collection
    {
        $collection = Collection::query()->where('slug', $slug)->first();
        if ($collection === null) {
            abort(404, 'Collection not found.');
        }

        return $collection;
    }

    /**
     * Entry gate: role ACL ∩ API key scopes via {@see CollectionPermissionEnforcer}.
     */
    protected function authorize(Collection $collection, CollectionPermissionActionEnum $action): void
    {
        app(CollectionPermissionEnforcer::class)->assertCollectionAction(
            request(),
            $collection,
            $action,
        );
    }
}
