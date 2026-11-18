<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\CreateContentCollectionAction;
use App\Enums\CollectionPermissionActionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ListContentCollectionsRequest;
use App\Http\Requests\Collections\StoreContentCollectionRequest;
use App\Http\Requests\Collections\UpdateContentCollectionRequest;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Collections\CollectionItemOptionsService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\CollectionPacks\CollectionPackRegistryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Content collection definitions: list, create, show (singleton editor), update, soft-delete.
 * Trash lives in CollectionTrashController, singleton content saves in
 * CollectionSingletonContentController, packs in CollectionPackController and the slug
 * check in CollectionSlugController.
 */
class ContentCollectionController extends Controller
{
    use ValidatesListPerPageTrait;

    public function __construct(
        private CollectionItemValuesAssemblerService $collectionItemValuesAssembler,
        private CollectionItemOptionsService $collectionItemOptionsService,
        private CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    /**
     * List collections, optionally including soft-deleted records.
     */
    public function index(ListContentCollectionsRequest $request): Response
    {
        $validated = $request->validated();

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
            ->get()
            ->filter(fn (Collection $collection): bool => $this->permissionEnforcer->isCollectionReadable(
                $request,
                $collection,
            ))
            ->values();

        // ponytail: readability is resolved per collection in PHP, so page in memory;
        // fine for collection counts (tens–hundreds), move to SQL if that ever grows.
        $perPage = $this->validatedListPerPage($request);
        $paginator = new LengthAwarePaginator(
            $collections->forPage(LengthAwarePaginator::resolveCurrentPage(), $perPage)->values(),
            $collections->count(),
            $perPage,
            LengthAwarePaginator::resolveCurrentPage(),
            ['path' => $request->url(), 'query' => $request->query()],
        );
        $paginatorPayload = $paginator->toArray();

        return Inertia::render('collections/collections/index', [
            'collections' => $paginatorPayload['data'],
            'pagination' => [
                'current_page' => $paginatorPayload['current_page'],
                'last_page' => $paginatorPayload['last_page'],
                'per_page' => $paginatorPayload['per_page'],
                'total' => $paginatorPayload['total'],
                'links' => $paginatorPayload['links'],
            ],
            'filters' => [
                'trashed' => $trashed,
                'search' => $search,
                'sort' => $sort,
                'direction' => $direction,
            ],
            'collectionPacks' => CollectionPackRegistryService::summaries(),
        ]);
    }

    /**
     * Create a collection and seed an empty singleton item when required.
     */
    public function store(
        StoreContentCollectionRequest $request,
        CreateContentCollectionAction $createContentCollection,
    ): RedirectResponse {
        $collection = $createContentCollection->execute($request->validated());

        return redirect()->route('collections.show', $collection)
            ->with('success', __('Collection created.'));
    }

    /**
     * Show a singleton collection editor or redirect list collections to their items index.
     */
    public function show(Request $request, Collection $collection): Response|RedirectResponse
    {
        $this->permissionEnforcer->assertCollectionAction(
            $request,
            $collection,
            CollectionPermissionActionEnum::Read,
        );

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
            'fieldGrants' => $this->permissionEnforcer->fieldGrantsForForm($request, $collection),
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
}
