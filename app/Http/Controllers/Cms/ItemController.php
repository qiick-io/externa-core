<?php

namespace App\Http\Controllers\Cms;

use App\Http\Controllers\Controller;
use App\Http\Requests\Cms\StoreItemRequest;
use App\Http\Requests\Cms\UpdateItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\ContentCollection;
use App\Models\Item;
use App\Services\Cms\ItemDataNormalizer;
use App\Services\Cms\ItemQueryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ItemController extends Controller
{
    public function __construct(
        private ItemQueryService $itemQueryService,
        private ItemDataNormalizer $itemDataNormalizer,
    ) {}

    public function index(Request $request, ContentCollection $collection): Response|RedirectResponse
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        if ($collection->is_singleton) {
            $first = $collection->items()->first();
            if ($first !== null) {
                return redirect()->route('cms.collections.items.edit', [$collection, $first]);
            }

            return redirect()->route('cms.collections.show', $collection);
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

        $query = Item::query()
            ->where('collection_id', $collection->id)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);

        $paginator = $query->latest('id')->paginate(15)->withQueryString();
        $paginator->setCollection(
            $paginator->getCollection()->map(fn (Item $item): array => (new ItemResource($item))->toArray($request))
        );

        return Inertia::render('cms/items/index', [
            'collection' => $collection,
            'items' => $paginator,
            'filters' => $stringFilters,
        ]);
    }

    public function create(ContentCollection $collection): Response
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        return Inertia::render('cms/items/create', [
            'collection' => $collection,
        ]);
    }

    public function store(StoreItemRequest $request, ContentCollection $collection): RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $request->validated('data') ?? []);

        $item = $collection->items()->create([
            'data' => $normalized,
        ]);

        if ($request->input('_from_collection_hub') === '1') {
            return redirect()->to(
                route('cms.collections.show', $collection).'?'.http_build_query(['item' => $item->id])
            )->with('success', __('Item created.'));
        }

        return redirect()->route('cms.collections.items.index', $collection)
            ->with('success', __('Item created.'));
    }

    public function show(Request $request, ContentCollection $collection, Item $item): Response
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return Inertia::render('cms/items/show', [
            'collection' => $collection,
            'item' => (new ItemResource($item))->toArray($request),
        ]);
    }

    public function edit(Request $request, ContentCollection $collection, Item $item): Response
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->load(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);

        return Inertia::render('cms/items/edit', [
            'collection' => $collection,
            'item' => (new ItemResource($item))->toArray($request),
            'rawData' => $item->data,
        ]);
    }

    public function update(UpdateItemRequest $request, ContentCollection $collection, Item $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $data = $item->data ?? [];
        if (! is_array($data)) {
            $data = [];
        }

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

        $item->update(['data' => $normalized]);

        if ($request->input('_from_collection_hub') === '1') {
            return redirect()->to(
                route('cms.collections.show', $collection).'?'.http_build_query(['item' => $item->id])
            )->with('success', __('Item updated.'));
        }

        return redirect()->route('cms.collections.items.show', [$collection, $item])
            ->with('success', __('Item updated.'));
    }

    public function destroy(ContentCollection $collection, Item $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->delete();

        return redirect()->route('cms.collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    private function assertItemBelongsToCollection(ContentCollection $collection, Item $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }
}
