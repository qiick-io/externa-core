<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;

final class CollectionQuery
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{slug: string}  $args
     * @return array<string, mixed>|null
     */
    public function __invoke(mixed $_, array $args): ?array
    {
        $collection = $this->findCollection($args['slug']);
        $this->authorize($collection, CollectionPermissionAction::Read);

        return [
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'is_singleton' => (bool) $collection->is_singleton,
        ];
    }
}
