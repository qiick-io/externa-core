<?php

namespace App\GraphQL\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionGuard;
use App\Support\Api\ApiAccess;

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

    protected function authorize(Collection $collection, CollectionPermissionActionEnum $action): void
    {
        $access = app(ApiAccess::class);
        $allowed = app(CollectionPermissionGuard::class)->allows(
            $access->roleId(),
            (int) $collection->id,
            $action,
        );
        if (! $allowed) {
            abort(403, 'This action is unauthorized for the collection.');
        }

        $apiKey = $access->apiKey;
        if ($apiKey === null) {
            return;
        }

        if (! $apiKey->allowsCollectionSlug((string) $collection->slug)) {
            abort(403, 'This action is unauthorized for the collection.');
        }

        if (! $apiKey->allowsAction($action)) {
            abort(403, 'This action is unauthorized for the collection.');
        }
    }
}
