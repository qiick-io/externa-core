<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionActionEnum;
use App\GraphQL\Concerns\AuthorizesGraphqlCollectionTrait;
use App\GraphQL\Concerns\SerializesGraphqlItemTrait;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Api\FilePermissionGuardService;
use App\Services\Api\PublicApiResponseCacheService;
use App\Support\Api\ApiAccess;

final class ItemQuery
{
    use AuthorizesGraphqlCollectionTrait;
    use SerializesGraphqlItemTrait;

    /**
     * @param  array{collection: string, id: string}  $args
     * @return array<string, mixed>|null
     */
    public function __invoke(mixed $_, array $args): ?array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionActionEnum::Read);

        $request = request();
        $cache = app(PublicApiResponseCacheService::class);
        $version = $cache->version((int) $collection->id);
        $access = app(ApiAccess::class);
        $roleId = $access->roleId();
        $hash = $cache->hash([
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'role_id' => $roleId,
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuardService::class)->grantsForRole($roleId),
            ...$access->responseCacheScopeFactors(),
            'surface' => 'graphql',
        ]);
        $key = $cache->itemKey($collection->slug, $args['id'], $version, $hash);

        // Convert after the cache read so entries cached before the fix are served correctly too.
        $payload = $cache->remember($key, function () use ($collection, $args, $request): ?array {
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

            app(CollectionPermissionEnforcerService::class)->assertItemReadable($request, $collection, $item);

            return (new CollectionItemResource($item))->toArray($request);
        });

        return is_array($payload) ? $this->withGraphqlTimestamps($payload) : null;
    }
}
