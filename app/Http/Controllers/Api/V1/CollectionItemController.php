<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Data\Collections\CollectionItemWriteData;
use App\Enums\CollectionPermissionActionEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesCollectionAccessTrait;
use App\Http\Controllers\Controller;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Api\RelationIncludeHydrator;
use App\Services\Collections\CollectionItemQueryService;
use App\Support\Api\PublicApiIncludeParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public CMS API: CRUD for collection items gated by collection_permissions.
 */
class CollectionItemController extends Controller
{
    use AuthorizesCollectionAccessTrait;

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CreateCollectionItemAction $createCollectionItemAction,
        private UpdateCollectionItemAction $updateCollectionItemAction,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private PublicApiResponseCache $responseCache,
    ) {}

    public function index(Request $request, string $slug): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionActionEnum::Read);

        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            $filters = [];
        }

        /** @var array<string, mixed> $stringFilters */
        $stringFilters = [];
        foreach ($filters as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }
            if (is_string($value) || is_numeric($value) || is_bool($value) || is_array($value) || $value === null) {
                $stringFilters[$key] = $value;
            }
        }

        $maxPerPage = max(1, (int) config('api.max_per_page', 100));
        $perPage = min(max($request->integer('per_page', 15), 1), $maxPerPage);
        $page = max($request->integer('page', 1), 1);

        $version = $this->responseCache->version((int) $collection->id);
        $access = $this->apiAccess($request);
        $roleId = $access->roleId();
        $hash = $this->responseCache->hash([
            'filter' => $stringFilters,
            'page' => $page,
            'per_page' => $perPage,
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'include' => app(PublicApiIncludeParser::class)->parse($request->query('include')),
            'role_id' => $roleId,
            // File field expansion depends on file grants, not only role_id.
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuard::class)->grantsForRole($roleId),
            ...$access->responseCacheScopeFactors(),
            'surface' => 'rest',
        ]);
        $key = $this->responseCache->itemsKey($slug, $version, $hash);

        $payload = $this->responseCache->remember($key, function () use ($request, $collection, $stringFilters, $perPage, $page): array {
            $collection->load(['fields' => fn ($q) => $q->ordered()]);

            $query = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ]);
            $this->itemQueryService->applyFilters($query, $collection, $stringFilters);
            $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

            $paginator = $query->latest('id')->paginate($perPage, ['*'], 'page', $page);
            $pageItems = $paginator->getCollection();
            $include = app(PublicApiIncludeParser::class)->parse($request->query('include'));
            if ($include !== []) {
                app(RelationIncludeHydrator::class)->prewarm($pageItems, $collection, $include, $request);
            }

            return [
                'data' => $pageItems
                    ->map(fn (CollectionItem $item): array => (new CollectionItemResource($item))->toArray($request))
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

        return response()->json($payload);
    }

    public function show(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionActionEnum::Read);

        $version = $this->responseCache->version((int) $collection->id);
        $access = $this->apiAccess($request);
        $roleId = $access->roleId();
        $hash = $this->responseCache->hash([
            'locale' => $request->query('locale'),
            'include_all_translations' => $request->boolean('include_all_translations'),
            'include' => app(PublicApiIncludeParser::class)->parse($request->query('include')),
            'role_id' => $roleId,
            'file_grants' => $roleId === null ? [] : app(FilePermissionGuard::class)->grantsForRole($roleId),
            ...$access->responseCacheScopeFactors(),
            'surface' => 'rest',
        ]);
        $key = $this->responseCache->itemKey($slug, $item, $version, $hash);

        $payload = $this->responseCache->remember($key, function () use ($request, $collection, $item): array {
            $model = CollectionItem::query()
                ->where('collection_id', $collection->id)
                ->whereKey($item)
                ->with([
                    'fieldValues',
                    'userCreated:id,first_name,last_name,email',
                    'userUpdated:id,first_name,last_name,email',
                    'collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()]),
                ])
                ->first();

            if ($model === null) {
                abort(404);
            }

            $this->permissionEnforcer->assertItemReadable($request, $collection, $model);

            return [
                'data' => (new CollectionItemResource($model))->toArray($request),
            ];
        });

        return response()->json($payload);
    }

    public function store(Request $request, string $slug): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionActionEnum::Create);

        $data = $request->input('data', []);
        if (! is_array($data)) {
            $data = [];
        }

        $item = $this->createCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            creating: true,
            request: $request,
            shouldAssertWritableFields: true,
            writableMode: 'create',
        ));
        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return response()->json([
            'data' => (new CollectionItemResource($item))->toArray($request),
        ], 201);
    }

    public function update(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionActionEnum::Update);

        $model = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($item)
            ->first();

        if ($model === null) {
            abort(404);
        }

        $this->permissionEnforcer->assertItemWritable($request, $collection, $model);

        $data = $request->input('data', []);
        if (! is_array($data)) {
            $data = [];
        }

        $model = $this->updateCollectionItemAction->execute(new CollectionItemWriteData(
            collection: $collection,
            data: $data,
            item: $model,
            creating: false,
            version: $collection->versioning ? 'draft' : 'published',
            request: $request,
            shouldAssertWritableFields: true,
            writableMode: 'update',
        ));
        $model->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return response()->json([
            'data' => (new CollectionItemResource($model))->toArray($request),
        ]);
    }

    public function destroy(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionActionEnum::Delete);

        $model = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($item)
            ->first();

        if ($model === null) {
            abort(404);
        }

        $this->permissionEnforcer->assertItemWritable($request, $collection, $model);

        $model->delete();

        return response()->json(null, 204);
    }
}
