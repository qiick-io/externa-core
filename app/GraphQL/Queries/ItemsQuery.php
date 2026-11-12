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
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionLocaleResolverService;
use App\Support\Api\ApiAccess;
use App\Support\Api\PublicItemSortParser;

final class ItemsQuery
{
    use AuthorizesGraphqlCollectionTrait;
    use SerializesGraphqlItemTrait;

    /**
     * @param  array{collection: string, filter?: mixed, page?: int, perPage?: int, sort?: list<mixed>|null}  $args
     * @return array{data: list<array<string, mixed>>, meta: array<string, int>}
     */
    public function __invoke(mixed $_, array $args): array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionActionEnum::Read);

        $filters = [];
        if (isset($args['filter']) && is_array($args['filter'])) {
            foreach ($args['filter'] as $key => $value) {
                if (is_string($key)) {
                    $filters[$key] = $value;
                }
            }
        }

        $maxPerPage = max(1, (int) config('api.max_per_page', 100));
        $perPage = min(max((int) ($args['perPage'] ?? 15), 1), $maxPerPage);
        $page = max((int) ($args['page'] ?? 1), 1);
        $request = request();
        $sortParser = app(PublicItemSortParser::class);
        $sortTokens = isset($args['sort']) && is_array($args['sort']) ? $args['sort'] : null;
        $sortKeys = $sortParser->parseGraphQl($sortTokens, $request, $collection);

        $cache = app(PublicApiResponseCacheService::class);
        $version = $cache->version((int) $collection->id);
        $access = app(ApiAccess::class);
        $roleId = $access->roleId();
        $hash = $cache->hash([
            'filter' => $filters,
            'page' => $page,
            'per_page' => $perPage,
            'sort' => $sortParser->cacheKey($sortKeys),
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'role_id' => $roleId,
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuardService::class)->grantsForRole($roleId),
            ...$access->responseCacheScopeFactors(),
            'surface' => 'graphql',
        ]);
        $key = $cache->itemsKey($collection->slug, $version, $hash);

        return $cache->remember($key, function () use ($collection, $filters, $perPage, $page, $request, $sortKeys): array {
            $collection->load(['fields' => fn ($q) => $q->ordered()]);

            $queryLocale = $request->query('locale');
            $localeOverride = is_string($queryLocale) && $queryLocale !== '' ? $queryLocale : null;
            $locale = app(CollectionLocaleResolverService::class)->resolve($localeOverride);

            $query = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ]);

            app(CollectionItemQueryService::class)->applyFilters($query, $collection, $filters, null, $request);
            app(CollectionPermissionEnforcerService::class)->applyItemFilterToQuery($request, $collection, $query);
            app(CollectionItemQueryService::class)->applyPublicSort($query, $collection, $sortKeys, $locale);

            $paginator = $query->paginate($perPage, ['*'], 'page', $page);

            return [
                'data' => $paginator->getCollection()
                    ->map(fn (CollectionItem $item): array => $this->serializeItem($item, $request))
                    ->values()
                    ->all(),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                ],
            ];
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeItem(CollectionItem $item, mixed $request): array
    {
        return $this->withGraphqlTimestamps((new CollectionItemResource($item))->toArray($request));
    }
}
