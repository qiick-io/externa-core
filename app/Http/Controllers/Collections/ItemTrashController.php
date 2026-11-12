<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\ApplyCollectionItemBulkAction;
use App\Enums\CollectionPermissionActionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\BulkItemActionRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Traits\AssertsItemBelongsToCollectionTrait;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Trash of a collection's items: restore and permanently delete one item, and the
 * list's bulk delete / restore / force-delete. Soft-deleting a single item stays on
 * `ItemController::destroy` (the item editor's delete).
 */
class ItemTrashController extends Controller
{
    use AssertsItemBelongsToCollectionTrait;

    public function __construct(
        private ApplyCollectionItemBulkAction $applyBulkAction,
    ) {}

    /**
     * Restore a soft-deleted collection item.
     */
    public function restore(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

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
        Gate::forUser($request->user())->authorize('deleteItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('delete', [$item, $collection]);

        $item->forceDelete();

        return redirect()->route('collections.items.index', [
            'collection' => $collection,
            'trashed' => 1,
        ])->with('success', __('Item permanently deleted.'));
    }

    /**
     * Run a bulk delete, restore, or force-delete action on selected items.
     */
    public function bulk(BulkItemActionRequest $request, Collection $collection): RedirectResponse
    {
        $action = $request->validated('action');
        /** @var list<int> $ids */
        $ids = $request->validated('ids');

        $collectionAction = match ($action) {
            'restore' => CollectionPermissionActionEnum::Update,
            default => CollectionPermissionActionEnum::Delete,
        };
        Gate::forUser($request->user())->authorize($collectionAction->itemsAbility(), $collection);

        $query = CollectionItem::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids);

        if ($action === 'restore' || $action === 'force_delete') {
            $query->onlyTrashed();
        }

        $items = $query->get();

        // Authorize every selected item before mutating any (no partial apply on AuthZ fail).
        $itemAbility = $action === 'restore' ? 'update' : 'delete';
        foreach ($items as $item) {
            Gate::forUser($request->user())->authorize($itemAbility, [$item, $collection]);
        }

        $this->applyBulkAction->execute($action, $items);

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }
}
