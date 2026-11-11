<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\DiscardCollectionItemDraftAction;
use App\Actions\Collections\ScheduleCollectionItemAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ScheduleCollectionItemRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemPublisherService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use RuntimeException;

/**
 * Content versioning transitions of a collection item: publish the draft, schedule
 * publish / unpublish, discard the draft. Editorial review lives in ItemApprovalController.
 */
class ItemWorkflowController extends Controller
{
    public function __construct(
        private CollectionItemPublisherService $itemPublisher,
        private ScheduleCollectionItemAction $scheduleCollectionItemAction,
        private DiscardCollectionItemDraftAction $discardCollectionItemDraftAction,
    ) {}

    /**
     * Promote draft_data into published field values (content versioning).
     */
    public function publish(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);
        abort_unless($collection->versioning, 422);

        if (! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('No draft changes to publish.'));
        }

        try {
            $this->itemPublisher->promote($item, $collection, scheduled: false);
        } catch (RuntimeException $e) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __($e->getMessage()));
        }

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'published',
        ])->with('success', __('Published.'));
    }

    /**
     * Schedule publish and/or unpublish for a versioned item.
     */
    public function schedule(ScheduleCollectionItemRequest $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        $validated = $request->validated();

        $version = $request->query('version', 'draft');
        if (! in_array($version, ['published', 'draft'], true)) {
            $version = 'draft';
        }

        if ($request->boolean('clear')) {
            $this->scheduleCollectionItemAction->execute($item, $version, shouldClear: true);

            return redirect()->route('collections.items.show', [
                'collection' => $collection,
                'item' => $item,
                'version' => $version,
            ])->with('success', __('Schedule cleared.'));
        }

        $touchPublish = $request->exists('publish_at');
        $touchUnpublish = $request->exists('unpublish_at');

        $publishAt = $touchPublish ? ($validated['publish_at'] ?? null) : $item->publish_at?->toIso8601String();
        $unpublishAt = $touchUnpublish ? ($validated['unpublish_at'] ?? null) : $item->unpublish_at?->toIso8601String();

        // Draft promote+unpublish pair only; published view schedules soft-delete alone.
        if (
            $version !== 'published'
            && $publishAt !== null
            && $unpublishAt !== null
            && strtotime((string) $unpublishAt) <= strtotime((string) $publishAt)
        ) {
            return redirect()
                ->back()
                ->with('error', __('Unpublish time must be after publish time.'));
        }

        if ($touchPublish && $publishAt !== null && ! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('Save a draft before scheduling publish.'));
        }

        if (
            $touchPublish
            && $publishAt !== null
            && $collection->approvals_required
            && (string) $item->approval_status !== 'approved'
        ) {
            return redirect()
                ->back()
                ->with('error', __('Item must be approved before scheduling publish.'));
        }

        $this->scheduleCollectionItemAction->execute(
            $item,
            $version,
            shouldClear: false,
            hasPublishAt: $touchPublish,
            hasUnpublishAt: $touchUnpublish,
            publishAt: $validated['publish_at'] ?? null,
            unpublishAt: $validated['unpublish_at'] ?? null,
        );

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => $version,
        ])->with('success', __('Schedule saved.'));
    }

    /**
     * Discard unpublished draft_data (content versioning). Published values untouched.
     */
    public function discardDraft(Request $request, Collection $collection, CollectionItem $item): RedirectResponse
    {
        Gate::forUser($request->user())->authorize('updateItems', $collection);
        $this->assertItemBelongsToCollection($collection, $item);
        Gate::forUser($request->user())->authorize('update', [$item, $collection]);
        abort_unless($collection->versioning, 422);

        if (! is_array($item->draft_data)) {
            return redirect()
                ->route('collections.items.show', [
                    'collection' => $collection,
                    'item' => $item,
                    'version' => 'draft',
                ])
                ->with('error', __('No draft to discard.'));
        }

        $this->discardCollectionItemDraftAction->execute($item, $collection);

        return redirect()->route('collections.items.show', [
            'collection' => $collection,
            'item' => $item,
            'version' => 'draft',
        ])->with('success', __('Draft discarded.'));
    }

    /**
     * Abort when the item does not belong to the route collection.
     */
    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }
}
