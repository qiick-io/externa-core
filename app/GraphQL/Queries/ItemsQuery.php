<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\GraphQL\Concerns\AuthorizesGraphqlCollection;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Collections\CollectionItemQueryService;
use App\Support\Api\ApiAccess;

final class ItemsQuery
{
    use AuthorizesGraphqlCollection;

    /**
     * @param  array{collection: string, filter?: mixed, page?: int, perPage?: int}  $args
     * @return array{data: list<array<string, mixed>>, meta: array<string, int>}
     */
    public function __invoke(mixed $_, array $args): array
    {
        $collection = $this->findCollection($args['collection']);
        $this->authorize($collection, CollectionPermissionAction::Read);

        $filters = [];
        if (isset($args['filter']) && is_array($args['filter'])) {
            foreach ($args['filter'] as $key => $value) {
                if (is_string($key)) {
                    $filters[$key] = $value;
                }
            }
        }

        $perPage = min(max((int) ($args['perPage'] ?? 15), 1), 100);
        $page = max((int) ($args['page'] ?? 1), 1);
        $request = request();

        $cache = app(PublicApiResponseCache::class);
        $version = $cache->version((int) $collection->id);
        $roleId = app(ApiAccess::class)->roleId();
        $hash = $cache->hash([
            'filter' => $filters,
            'page' => $page,
            'per_page' => $perPage,
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'role_id' => $roleId,
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuard::class)->grantsForRole($roleId),
            'surface' => 'graphql',
        ]);
        $key = $cache->itemsKey($collection->slug, $version, $hash);

        return $cache->remember($key, function () use ($collection, $filters, $perPage, $page, $request): array {
            $collection->load(['fields' => fn ($q) => $q->ordered()]);

            $query = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ]);

            app(CollectionItemQueryService::class)->applyFilters($query, $collection, $filters);
            app(CollectionPermissionEnforcer::class)->applyItemFilterToQuery($request, $collection, $query);

            $paginator = $query->latest('id')->paginate($perPage, ['*'], 'page', $page);

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
        $payload = (new CollectionItemResource($item))->toArray($request);

        // Lighthouse DateTime scalar expects Y-m-d H:i:s
        foreach (['created_at', 'updated_at'] as $key) {
            if (! empty($payload[$key]) && is_string($payload[$key])) {
                $payload[$key] = date('Y-m-d H:i:s', strtotime($payload[$key]));
            }
        }

        return $payload;
    }
}
