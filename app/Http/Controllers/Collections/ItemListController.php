<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\UpdateCollectionListColumnsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\UpdateCollectionListColumnsRequest;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Models\Collection;
use App\Services\Collections\CollectionItemExportService;
use App\Services\Collections\CollectionItemListService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The admin item list page: the table / kanban / calendar index, its filtered export
 * and the user's saved list columns. Singleton collections have no list and redirect
 * to their editor.
 */
class ItemListController extends Controller
{
    use ValidatesListPerPageTrait;

    public function __construct(
        private CollectionItemListService $itemListService,
        private CollectionItemExportService $itemExportService,
        private UpdateCollectionListColumnsAction $updateListColumnsAction,
    ) {}

    /**
     * List collection items or redirect singleton collections to their editor.
     */
    public function index(Request $request, Collection $collection): Response|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('viewItems', $collection);

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

        return Inertia::render('collections/items/index', $this->itemListService->indexProps(
            $request,
            $collection,
            $this->validatedListPerPage($request),
        ));
    }

    /**
     * Download filtered collection items as CSV or JSON (capped).
     *
     * Uses the list page's `filter[...]` parsing, so the export matches what the list shows.
     */
    public function export(Request $request, Collection $collection): StreamedResponse|RedirectResponse
    {
        Gate::forUser($request->user())->authorize('viewItems', $collection);

        if ($collection->is_singleton) {
            return redirect()->route('collections.show', $collection);
        }

        $format = strtolower((string) $request->query('format', 'csv'));
        if (! in_array($format, ['csv', 'json'], true)) {
            abort(422, __('format must be csv or json.'));
        }

        $sortParam = $request->query('sort');
        $directionParam = $request->query('direction');

        return $this->itemExportService->download(
            $collection,
            $format,
            $this->itemListService->parseStringFilters($request),
            is_string($sortParam) ? $sortParam : null,
            is_string($directionParam) ? $directionParam : null,
            $request,
        );
    }

    /**
     * Persist the current user's list column preferences for a collection.
     *
     * Layout, kanban and calendar fields are only written when the request sends them.
     */
    public function updateListColumns(
        UpdateCollectionListColumnsRequest $request,
        Collection $collection,
    ): RedirectResponse {
        Gate::forUser($request->user())->authorize('viewItems', $collection);

        $user = $request->user();
        abort_if($user === null, 403);

        $preferences = [
            'columns' => $request->input('columns'),
            'aligns' => $request->input('aligns', []),
        ];

        foreach (UpdateCollectionListColumnsAction::OPTIONAL_PREFERENCES as $preferenceKey) {
            if ($request->exists($preferenceKey)) {
                $preferences[$preferenceKey] = $request->input($preferenceKey);
            }
        }

        $this->updateListColumnsAction->execute($user->id, $collection, $preferences);

        return redirect()->back();
    }
}
