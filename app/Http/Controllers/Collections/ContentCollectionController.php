<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ApplyCollectionPackRequest;
use App\Http\Requests\Collections\StoreContentCollectionRequest;
use App\Http\Requests\Collections\UpdateContentCollectionRequest;
use App\Http\Requests\Collections\UpsertSingletonCollectionItemRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\ApplyCollectionPackService;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Support\Collections\CollectionPacks\CollectionPackRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Manages content collection definitions and singleton content editing.
 */
class ContentCollectionController extends Controller
{
    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = [
        'name',
        'slug',
        'updated_at',
    ];

    public function __construct(
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
    ) {}

    /**
     * List collections, optionally including soft-deleted records.
     */
    public function index(Request $request): Response
    {
        $validated = $request->validate([
            'trashed' => ['sometimes', 'boolean'],
            'search' => ['nullable', 'string', 'max:255'],
            'sort' => ['nullable', 'string', Rule::in(self::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
        ]);

        $trashed = $request->boolean('trashed');
        $search = isset($validated['search'])
            ? trim((string) $validated['search'])
            : '';
        $sort = $validated['sort'] ?? 'name';
        $direction = ($validated['direction'] ?? 'asc') === 'desc' ? 'desc' : 'asc';

        $collections = Collection::query()
            ->when($trashed, fn ($query) => $query->onlyTrashed())
            ->when($search !== '', function ($query) use ($search) {
                $term = '%'.$search.'%';
                $query->where(function ($inner) use ($term): void {
                    $inner->where('name', 'like', $term)
                        ->orWhere('slug', 'like', $term);
                });
            })
            ->orderBy($sort, $direction)
            ->get();

        return Inertia::render('collections/collections/index', [
            'collections' => $collections,
            'filters' => [
                'trashed' => $trashed,
                'search' => $search,
                'sort' => $sort,
                'direction' => $direction,
            ],
            'collectionPacks' => CollectionPackRegistry::summaries(),
        ]);
    }

    /**
     * Create a collection and seed an empty singleton item when required.
     */
    public function store(StoreContentCollectionRequest $request): RedirectResponse
    {
        $collection = Collection::query()->create($request->validated());

        if ($collection->is_singleton) {
            $collection->items()->create([]);
        }

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Collection created.'));
    }

    /**
     * Apply a registered collection pack (auto-create dependencies, skip existing fields).
     */
    public function applyPack(
        ApplyCollectionPackRequest $request,
        string $pack,
        ApplyCollectionPackService $applyCollectionPack,
    ): RedirectResponse {
        $validated = $request->validated();

        $result = $applyCollectionPack->apply($pack, [
            'name' => $validated['name'] ?? null,
            'slug' => $validated['slug'] ?? null,
        ]);

        $collection = Collection::query()->findOrFail($result['collection']['id']);
        $createdFields = count($result['created_fields']) + count($result['created_relations']);
        $skippedFields = count($result['skipped_fields']) + count($result['skipped_relations']);

        $message = $result['collection']['created']
            ? __('Collection pack applied: :name created with :created field(s) (:skipped skipped).', [
                'name' => $collection->name,
                'created' => $createdFields,
                'skipped' => $skippedFields,
            ])
            : __('Collection pack applied on existing :name: :created field(s) created, :skipped skipped.', [
                'name' => $collection->name,
                'created' => $createdFields,
                'skipped' => $skippedFields,
            ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $message);
    }

    /**
     * Show a singleton collection editor or redirect list collections to their items index.
     */
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
            'relatedCollections' => $this->collectionItemOptionsService->collectionsForSelect(),
        ]);
    }

    /**
     * Update collection metadata.
     */
    public function update(UpdateContentCollectionRequest $request, Collection $collection): RedirectResponse
    {
        $collection->update($request->validated());

        return back()
            ->with('success', __('Collection updated.'));
    }

    /**
     * Soft-delete a collection.
     */
    public function destroy(Collection $collection): RedirectResponse
    {
        $collection->delete();

        return redirect()->route('collections.index')
            ->with('success', __('Collection deleted.'));
    }

    /**
     * Restore a soft-deleted collection.
     */
    public function restore(Collection $collection): RedirectResponse
    {
        $collection->restore();

        return redirect()->route('collections.index', ['trashed' => 1])
            ->with('success', __('Collection restored.'));
    }

    /**
     * Permanently delete a collection.
     */
    public function forceDelete(Collection $collection): RedirectResponse
    {
        $collection->forceDelete();

        return redirect()->route('collections.index', ['trashed' => 1])
            ->with('success', __('Collection permanently deleted.'));
    }

    /**
     * Create or merge singleton collection content while preserving readonly fields.
     */
    public function upsertSingletonContent(UpsertSingletonCollectionItemRequest $request, Collection $collection): RedirectResponse
    {
        abort_unless($collection->is_singleton, 404);

        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming)) {
            $incoming = [];
        }

        $item = $collection->items()->first();

        if (! $item instanceof CollectionItem) {
            $normalized = $this->itemDataNormalizer->normalize($collection, $incoming, true);
            $created = $collection->items()->create([]);
            $this->collectionItemValuesWriter->sync($created, $collection, $normalized);

            return redirect()->route('collections.show', $collection)
                ->with('success', __('Content saved.'));
        }

        $data = $this->collectionItemValuesAssembler->assemble($item);
        $collection->loadMissing('fields');
        foreach ($collection->fields as $field) {
            if ($field->isReadonly()) {
                unset($incoming[$field->name]);
            }
        }

        foreach ($incoming as $key => $value) {
            // ponytail: array_merge appends list fields (blocks/m2a/files); only merge associative maps (locales).
            if (
                is_array($value)
                && isset($data[$key])
                && is_array($data[$key])
                && ! array_is_list($value)
            ) {
                $data[$key] = array_merge($data[$key], $value);
            } else {
                $data[$key] = $value;
            }
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data, false);

        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Content updated.'));
    }
}
