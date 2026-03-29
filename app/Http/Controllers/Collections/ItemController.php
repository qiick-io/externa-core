<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreItemRequest;
use App\Http\Requests\Collections\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ItemController extends Controller
{
    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
    ) {}

    public function index(Request $request, Collection $collection): Response|RedirectResponse
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        if ($collection->is_singleton) {
            $first = $collection->items()->first();
            if ($first !== null) {
                return redirect()->to(
                    route('collections.show', $collection).'?'.http_build_query(['item' => $first->id])
                );
            }

            return redirect()->route('collections.show', $collection);
        }

        $filters = $request->query('filter', []);
        if (! is_array($filters)) {
            $filters = [];
        }

        /** @var array<string, string> $stringFilters */
        $stringFilters = [];
        foreach ($filters as $key => $value) {
            if (is_string($key) && (is_string($value) || is_numeric($value))) {
                $stringFilters[$key] = (string) $value;
            }
        }

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);

        $paginator = $query->latest('id')->paginate(15)->withQueryString();
        $paginator->setCollection(
            $paginator->getCollection()->map(fn (CollectionItem $item): array => (new ItemResource($item))->toArray($request))
        );

        return Inertia::render('collections/items/index', [
            'collection' => $collection,
            'items' => $paginator,
            'filters' => $stringFilters,
        ]);
    }

    public function newItem(Request $request, Collection $collection): Response|RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        return Inertia::render('collections/items/form', [
            'collection' => $collection,
            'item' => null,
            'rawData' => [],
            'isNew' => true,
        ]);
    }

    public function store(StoreItemRequest $request, Collection $collection): RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $request->validated('data') ?? []);

        $item = $collection->items()->create([]);

        $this->collectionItemValuesWriter->sync($item, $collection, $normalized);

        return redirect()->route('collections.items.show', [$collection, $item])
            ->with('success', __('Item created.'));
    }

    public function show(Request $request, Collection $collection, CollectionItem $item): Response|RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $item->load(['collection.fields']);

        $rawData = $this->collectionItemValuesAssembler->assemble($item);

        return Inertia::render('collections/items/form', [
            'collection' => $collection,
            'item' => (new ItemResource($item))->toArray($request),
            'rawData' => $rawData,
            'isNew' => false,
        ]);
    }

    public function update(UpdateItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $data = $this->collectionItemValuesAssembler->assemble($item);

        $incoming = $request->validated('data') ?? [];
        if (is_array($incoming)) {
            foreach ($incoming as $key => $value) {
                if (is_array($value) && isset($data[$key]) && is_array($data[$key])) {
                    $data[$key] = array_merge($data[$key], $value);
                } else {
                    $data[$key] = $value;
                }
            }
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data);

        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        return redirect()->route('collections.items.show', [$collection, $item])
            ->with('success', __('Item updated.'));
    }

    public function destroy(Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }
}
