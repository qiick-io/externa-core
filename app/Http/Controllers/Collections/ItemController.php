<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionItemRequest;
use App\Http\Requests\Collections\UpdateCollectionListColumnsRequest;
use App\Http\Resources\CollectionItemResource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemExportService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\CollectionListColumnsNormalizer;
use App\Services\Collections\CollectionListDisplayEnricher;
use App\Services\Settings\SettingsRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * CRUD and relational field option endpoints for non-singleton collection items.
 */
class ItemController extends Controller
{
    public function __construct(
        private CollectionItemQueryService $itemQueryService,
        private CollectionItemDataNormalizer $itemDataNormalizer,
        private CollectionItemValuesWriter $collectionItemValuesWriter,
        private CollectionItemValuesAssembler $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private CollectionListColumnsNormalizer $listColumnsNormalizer,
        private CollectionListDisplayEnricher $listDisplayEnricher,
        private SettingsRepository $settingsRepository,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private CollectionItemExportService $itemExportService,
    ) {}

    /**
     * List collection items or redirect singleton collections to their editor.
     */
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

        $trashed = $request->boolean('trashed');
        $query = CollectionItem::query()
            ->when($trashed, fn ($query) => $query->onlyTrashed())
            ->where('collection_id', $collection->id)
            ->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])]);
        $this->itemQueryService->applyFilters($query, $collection, $stringFilters);

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');
        $sortState = $this->itemQueryService->applySort(
            $query,
            $collection,
            is_string($sortParam) ? $sortParam : null,
            is_string($directionParam) ? $directionParam : null,
        );

        $listColumns = $this->resolveListColumns($request, $collection);
        $columnAligns = $this->resolveColumnAligns($request, $collection, $listColumns);

        $this->permissionEnforcer->applyItemFilterToQuery($request, $collection, $query);

        $paginator = $query->paginate(15)->withQueryString();
        $rows = $paginator->getCollection()
            ->map(fn (CollectionItem $item): array => (new CollectionItemResource($item))->toArray($request))
            ->all();
        $rows = $this->listDisplayEnricher->enrich($collection, $rows, $listColumns);
        $paginator->setCollection(collect($rows));

        return Inertia::render('collections/items/index', [
            'collection' => $collection,
            'items' => $paginator,
            'list_columns' => $listColumns,
            'column_aligns' => $columnAligns,
            'related_fields_catalog' => $this->listColumnsNormalizer->relatedFieldsCatalog($collection),
            'filters' => [
                ...$stringFilters,
                'trashed' => $trashed,
                'sort' => $sortState['sort'],
                'direction' => $sortState['direction'],
            ],
        ]);
    }

    /**
     * Download filtered collection items as CSV or JSON (capped).
     */
    public function export(Request $request, Collection $collection): StreamedResponse|RedirectResponse
    {
        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $format = strtolower((string) $request->query('format', 'csv'));
        if (! in_array($format, ['csv', 'json'], true)) {
            abort(422, 'format must be csv or json.');
        }

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

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');

        return $this->itemExportService->download(
            $collection,
            $format,
            $stringFilters,
            is_string($sortParam) ? $sortParam : null,
            is_string($directionParam) ? $directionParam : null,
            $request,
        );
    }

    /**
     * Persist the current user's list column preferences for a collection.
     */
    public function updateListColumns(
        UpdateCollectionListColumnsRequest $request,
        Collection $collection,
    ): RedirectResponse {
        $user = $request->user();
        abort_if($user === null, 403);

        $this->settingsRepository->set(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id,
            $request->input('columns'),
            $user->id,
        );

        $this->settingsRepository->set(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id.'_aligns',
            $request->input('aligns', []),
            $user->id,
        );

        return redirect()->back();
    }

    /**
     * Render the create-item form or redirect singleton collections.
     */
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
            'relatedCollections' => $this->relatedCollectionsForSelect(),
        ]);
    }

    /**
     * Create a collection item from validated field data.
     */
    public function store(StoreCollectionItemRequest $request, Collection $collection): RedirectResponse
    {
        if ($collection->is_singleton && $collection->items()->exists()) {
            abort(422, __('A singleton collection already has its content item.'));
        }

        $data = $request->validated('data') ?? [];
        if (! is_array($data)) {
            $data = [];
        }
        $this->permissionEnforcer->assertWritableFields($request, $collection, $data, 'create');

        $normalized = $this->itemDataNormalizer->normalize(
            $collection,
            $data,
            true,
        );

        $item = $collection->items()->create([]);

        $this->collectionItemValuesWriter->sync($item, $collection, $normalized);

        return redirect()->route('collections.items.show', [$collection, $item])
            ->with('success', __('Item created.'));
    }

    /**
     * Show the item editor or redirect singleton collections.
     */
    public function show(Request $request, Collection $collection, CollectionItem $item): Response|RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $item->load(['collection.fields']);

        $rawData = $this->collectionItemValuesAssembler->assemble($item);

        return Inertia::render('collections/items/form', [
            'collection' => $collection,
            'item' => (new CollectionItemResource($item))->toArray($request),
            'rawData' => $rawData,
            'isNew' => false,
            'relatedCollections' => $this->relatedCollectionsForSelect(),
        ]);
    }

    /**
     * Update a collection item while preserving readonly field values.
     */
    public function update(UpdateCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $data = $this->collectionItemValuesAssembler->assemble($item);

        $incoming = $request->validated('data') ?? [];
        if (is_array($incoming)) {
            $this->permissionEnforcer->assertWritableFields($request, $collection, $incoming, 'update');
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
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data, false);

        $this->collectionItemValuesWriter->sync($item->fresh(), $collection, $normalized);

        return redirect()->route('collections.items.show', [$collection, $item])
            ->with('success', __('Item updated.'));
    }

    /**
     * Soft-delete a collection item.
     */
    public function destroy(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $item->delete();

        return redirect()->route('collections.items.index', $collection)
            ->with('success', __('Item deleted.'));
    }

    /**
     * Restore a soft-deleted collection item.
     */
    public function restore(Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);

        $item->restore();

        return redirect()->route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ])->with('success', __('Item restored.'));
    }

    /**
     * Permanently delete a collection item.
     */
    public function forceDelete(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $this->assertItemBelongsToCollection($collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $item->forceDelete();

        return redirect()->route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ])->with('success', __('Item permanently deleted.'));
    }

    /**
     * Paginate selectable options for a relational collection field.
     *
     * ponytail: renamed from `options` because Wayfinder codegen shadows RouteQueryOptions.
     */
    public function fieldOptions(Request $request, Collection $collection): JsonResponse
    {
        $validated = $request->validate([
            'field_id' => ['required', 'integer'],
            'related_collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'display_field' => ['nullable', 'string', 'max:64'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

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

    /**
     * Abort when the item does not belong to the route collection.
     */
    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }

    /**
     * Load related collections for relational field pickers.
     *
     * @return list<array{id: int, name: string, slug: string}>
     */
    private function relatedCollectionsForSelect(): array
    {
        return $this->collectionItemOptionsService->collectionsForSelect();
    }

    /**
     * @return list<string>
     */
    private function resolveListColumns(Request $request, Collection $collection): array
    {
        $user = $request->user();
        $stored = $user !== null
            ? $this->settingsRepository->get(
                SettingsRepository::SCOPE_USER,
                'collection_list',
                'collection_'.$collection->id,
                $user->id,
            )
            : null;

        return $this->listColumnsNormalizer->normalize($stored, $collection);
    }

    /**
     * @param  list<string>  $listColumns
     * @return array<string, 'left'|'center'|'right'>
     */
    private function resolveColumnAligns(Request $request, Collection $collection, array $listColumns): array
    {
        $user = $request->user();
        if ($user === null) {
            return [];
        }

        $stored = $this->settingsRepository->get(
            SettingsRepository::SCOPE_USER,
            'collection_list',
            'collection_'.$collection->id.'_aligns',
            $user->id,
        );

        if (! is_array($stored)) {
            return [];
        }

        $allowed = array_flip($listColumns);
        $out = [];

        foreach ($stored as $path => $align) {
            if (! is_string($path) || ! isset($allowed[$path])) {
                continue;
            }

            if (! in_array($align, ['left', 'center', 'right'], true)) {
                continue;
            }

            $out[$path] = $align;
        }

        return $out;
    }
}
