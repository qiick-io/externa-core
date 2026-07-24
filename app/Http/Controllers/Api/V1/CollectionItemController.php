<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CollectionPermissionAction;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesCollectionAccess;
use App\Http\Controllers\Controller;
use App\Http\Resources\CollectionItemResource;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Public CMS API: CRUD for collection items gated by collection_permissions.
 */
class CollectionItemController extends Controller
{
    use AuthorizesCollectionAccess;

    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    public function index(Request $request, string $slug): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Read);

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

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

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);

        $perPage = min(max($request->integer('per_page', 15), 1), 100);
        $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

        $paginator = $query->latest('id')->paginate($perPage);

        return response()->json([
            'data' => $paginator->getCollection()
                ->map(fn (CollectionItem $item): array => (new CollectionItemResource($item))->toArray($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Read);

        $model = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereKey($item)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])])
            ->first();

        if ($model === null) {
            abort(404);
        }

        $this->permissionEnforcer->assertItemReadable($request, $collection, $model);

        return response()->json([
            'data' => (new CollectionItemResource($model))->toArray($request),
        ]);
    }

    public function store(Request $request, string $slug): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Create);

        if ($collection->is_singleton && $collection->items()->exists()) {
            throw ValidationException::withMessages([
                'collection' => [__('A singleton collection already has its content item.')],
            ]);
        }

        $data = $request->input('data', []);
        if (! is_array($data)) {
            $data = [];
        }
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'create');

        $this->validateItemPayload($request, $collection, true);

        $normalized = $this->itemDataNormalizer->normalize($collection, $data, true);
        $item = $collection->items()->create([]);
        $this->collectionItemValuesWriter->sync($item, $collection, $normalized);
        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return response()->json([
            'data' => (new CollectionItemResource($item))->toArray($request),
        ], 201);
    }

    public function update(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Update);

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
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'update');

        $this->validateItemPayload($request, $collection, false);

        $normalized = $this->itemDataNormalizer->normalize($collection, $data, false);
        $this->collectionItemValuesWriter->sync($model, $collection, $normalized);
        $model->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return response()->json([
            'data' => (new CollectionItemResource($model))->toArray($request),
        ]);
    }

    public function destroy(Request $request, string $slug, int $item): JsonResponse
    {
        $collection = $this->findCollectionBySlug($slug);
        $this->authorizeCollection($request, $collection, CollectionPermissionAction::Delete);

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

    private function validateItemPayload(Request $request, $collection, bool $creating): void
    {
        $data = $request->input('data');
        $rules = app(CollectionItemDataRuleBuilder::class)->rules(
            $collection,
            $creating,
            null,
            is_array($data) ? $data : [],
        );
        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request, $collection): void {
            $data = $request->input('data');
            if (! is_array($data)) {
                return;
            }
            app(CollectionItemDataRuleBuilder::class)->assertKnownKeysOnly($collection, $data);
        });
        $validator->validate();
    }
}
