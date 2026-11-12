<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\UpsertSingletonCollectionContentAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\UpsertSingletonCollectionItemRequest;
use App\Models\Collection;
use Illuminate\Http\RedirectResponse;

/**
 * Save the content of a singleton collection from its editor (the collection show page).
 */
class CollectionSingletonContentController extends Controller
{
    /**
     * Create or merge singleton collection content while preserving readonly fields.
     */
    public function upsertSingletonContent(
        UpsertSingletonCollectionItemRequest $request,
        Collection $collection,
        UpsertSingletonCollectionContentAction $upsertSingletonContent,
    ): RedirectResponse {
        abort_unless($collection->is_singleton, 404);

        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming)) {
            $incoming = [];
        }

        $wasCreated = $upsertSingletonContent->execute($collection, $incoming);

        return redirect()->route('collections.show', $collection)
            ->with('success', $wasCreated ? __('Content saved.') : __('Content updated.'));
    }
}
