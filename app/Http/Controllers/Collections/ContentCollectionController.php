<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreContentCollectionRequest;
use App\Http\Requests\Collections\UpdateContentCollectionRequest;
use App\Http\Requests\Collections\UpsertSingletonItemRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ContentCollectionController extends Controller
{
    public function __construct(
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
    ) {}

    public function index(): Response
    {
        $collections = Collection::query()->ordered()->get();

        return Inertia::render('collections/collections/index', [
            'collections' => $collections,
        ]);
    }

    public function store(StoreContentCollectionRequest $request): RedirectResponse
    {
        $collection = Collection::query()->create($request->validated());

        if ($collection->is_singleton) {
            $collection->items()->create([]);
        }

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Collection created.'));
    }

    public function show(Request $request, Collection $collection): Response|RedirectResponse
    {
        if (! $collection->is_singleton) {
            return redirect()->route('collections.items.index', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        /** @var array<string, mixed>|null */
        $singletonRawData = null;

        $first = $collection->items()->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])])->first();
        if ($first instanceof CollectionItem) {
            $singletonRawData = $this->collectionItemValuesAssembler->assemble($first);
        }

        return Inertia::render('collections/collections/show', [
            'collection' => $collection,
            'singletonRawData' => $singletonRawData,
        ]);
    }

    public function update(UpdateContentCollectionRequest $request, Collection $collection): RedirectResponse
    {
        $collection->update($request->validated());

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Collection updated.'));
    }

    public function destroy(Collection $collection): RedirectResponse
    {
        $collection->delete();

        return redirect()->route('collections.index')
            ->with('success', __('Collection deleted.'));
    }

    public function upsertSingletonContent(UpsertSingletonItemRequest $request, Collection $collection): RedirectResponse
    {
        abort_unless($collection->is_singleton, 404);

        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming)) {
            $incoming = [];
        }

        $item = $collection->items()->first();

        if (! $item instanceof CollectionItem) {
            $normalized = $this->itemDataNormalizer->normalize($collection, $incoming);
            $created = $collection->items()->create([]);
            $this->collectionItemValuesWriter->sync($created, $collection, $normalized);

            return redirect()->route('collections.show', $collection)
                ->with('success', __('Content saved.'));
        }

        $data = $this->collectionItemValuesAssembler->assemble($item);
        foreach ($incoming as $key => $value) {
            if (is_array($value) && isset($data[$key]) && is_array($data[$key])) {
                $data[$key] = array_merge($data[$key], $value);
            } else {
                $data[$key] = $value;
            }
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data);

        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Content updated.'));
    }
}
