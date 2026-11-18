<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\ApplyCollectionBulkAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\BulkCollectionActionRequest;
use App\Models\Collection;
use Illuminate\Http\RedirectResponse;

/**
 * Collection trash: restore and permanently delete soft-deleted collections, plus the
 * bulk delete / restore / force-delete of the collections list.
 */
class CollectionTrashController extends Controller
{
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
     * Run a bulk delete, restore, or force-delete action on selected collections.
     */
    public function bulk(
        BulkCollectionActionRequest $request,
        ApplyCollectionBulkAction $applyCollectionBulk,
    ): RedirectResponse {
        $applyCollectionBulk->execute($request->validated('action'), $request->validated('ids'));

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }
}
