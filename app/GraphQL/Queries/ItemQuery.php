<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use App\Support\Api\ApiAccess;

final class ItemQuery
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{collection: string, id: string}  $args
     * @return array<string, mixed>|null
     */
    public function __invoke(mixed $_, array $args): ?array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionAction::Read);

        $request = request();
        $cache = app(PublicApiResponseCache::class);
        $version = $cache->version((int) $collection->id);
        $roleId = app(ApiAccess::class)->roleId();
        $hash = $cache->hash([
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'role_id' => $roleId,
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuard::class)->grantsForRole($roleId),
            'surface' => 'graphql',
        ]);
        $key = $cache->itemKey($collection->slug, $args['id'], $version, $hash);

        return $cache->remember($key, function () use ($collection, $args, $request): ?array {
            $item = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKey($args['id'])
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ])
                ->first();

            if ($item === null) {
                return null;
            }

            app(CollectionPermissionEnforcer::class)->assertItemReadable($request, $collection, $item);

            return (new CollectionItemResource($item))->toArray($request);
        });
    }
}
