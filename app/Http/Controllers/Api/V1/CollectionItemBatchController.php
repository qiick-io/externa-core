<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Collections\CreateCollectionItemAction;
use App\Actions\Collections\UpdateCollectionItemAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\BatchDestroyCollectionItemsRequest;
use App\Http\Requests\Api\V1\BatchStoreCollectionItemsRequest;
use App\Http\Requests\Api\V1\BatchUpdateCollectionItemsRequest;
use App\Services\Api\BatchCollectionItemsService;
use Illuminate\Http\JsonResponse;

/**
 * Public CMS API: batch create, update, and delete of collection items.
 *
 * The batch requests resolve the collection and check collection_permissions before validation.
 */
class CollectionItemBatchController extends Controller
{
    public function __construct(
        private BatchCollectionItemsService $batchCollectionItemsService,
    ) {}

    /**
     * Batch-create items; each entry uses {@see CreateCollectionItemAction}.
     */
    public function batchStore(BatchStoreCollectionItemsRequest $request, string $slug): JsonResponse
    {
        $collection = $request->collection();
        $validated = $request->validated();

        /** @var list<array{data?: mixed}> $items */
        $items = array_values($validated['items']);

        return response()->json(
            $this->batchCollectionItemsService->create($request, $collection, $items),
        );
    }

    /**
     * Batch-update items; each entry uses {@see UpdateCollectionItemAction}.
     */
    public function batchUpdate(BatchUpdateCollectionItemsRequest $request, string $slug): JsonResponse
    {
        $collection = $request->collection();
        $validated = $request->validated();

        /** @var list<array{id: int, data?: mixed}> $items */
        $items = array_values($validated['items']);

        return response()->json(
            $this->batchCollectionItemsService->update($request, $collection, $items),
        );
    }

    /**
     * Batch soft-delete items (same soft-delete path as single destroy).
     */
    public function batchDestroy(BatchDestroyCollectionItemsRequest $request, string $slug): JsonResponse
    {
        $collection = $request->collection();
        $validated = $request->validated();

        /** @var list<int> $ids */
        $ids = array_values($validated['ids']);

        return response()->json(
            $this->batchCollectionItemsService->delete($request, $collection, $ids),
        );
    }
}
