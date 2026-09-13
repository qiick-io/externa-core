<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Services\Api\PublicApiResponseCache;

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

        $cache = app(PublicApiResponseCache::class);
        $version = $cache->version((int) $collection->id);
        $key = $cache->collectionKey($collection->slug, $version, 'graphql');

        return $cache->remember($key, fn (): array => [
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'is_singleton' => (bool) $collection->is_singleton,
        ]);
    }
}
