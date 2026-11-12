<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ListCollectionFieldOptionsRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemOptionsService;
use Illuminate\Http\JsonResponse;

/**
 * Selectable options (items of the related collection) for the relational field pickers
 * of the item editor. Authorization is in the FormRequest.
 */
class ItemFieldOptionController extends Controller
{
    public function __construct(
        private CollectionItemOptionsService $collectionItemOptionsService,
    ) {}

    /**
     * Paginate selectable options for a relational collection field.
     *
     * ponytail: renamed from `options` because Wayfinder codegen shadows RouteQueryOptions.
     */
    public function fieldOptions(ListCollectionFieldOptionsRequest $request, Collection $collection): JsonResponse
    {
        $validated = $request->validated();

        $field = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->where('id', $validated['field_id'])
            ->firstOrFail();

        $relatedCollectionOverride = isset($validated['related_collection_id'])
            ? (int) $validated['related_collection_id']
            : null;

        $paginator = $this->collectionItemOptionsService->paginateForField(
            $field,
            $validated['search'] ?? null,
            $validated['per_page'] ?? 20,
            $relatedCollectionOverride,
            isset($validated['display_field']) ? (string) $validated['display_field'] : null,
        );

        return response()->json($paginator);
    }
}
