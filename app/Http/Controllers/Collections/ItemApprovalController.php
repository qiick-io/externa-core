<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\RejectCollectionItemRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemApprovalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Editorial review of a collection item draft: submit for review, approve, reject.
 * The state machine lives in CollectionItemApprovalService.
 */
class ItemApprovalController extends Controller
{
    public function __construct(
        private CollectionItemApprovalService $itemApprovals,
    ) {}

    /**
     * Submit draft for editorial review.
     */
    public function submitForReview(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->submit($item, $collection, $user);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Submitted for review.'));
    }

    /**
     * Approve a draft that is in review.
     */
    public function approve(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->approve($item, $collection, $user);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Approved.'));
    }

    /**
     * Reject a draft that is in review (note required).
     */
    public function reject(RejectCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $validated = $request->validated();

        /** @var User $user */
        $user = $request->user();
        $this->itemApprovals->reject($item, $collection, $user, $validated['rejection_note']);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Rejected.'));
    }

    /**
     * Abort when the item does not belong to the route collection.
     */
    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }
}
