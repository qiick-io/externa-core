<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * List, compare, and restore collection item revisions.
 */
class ItemRevisionController extends Controller
{
    public function __construct(
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemValuesWriter $writer,
    ) {}

    public function index(Request $request, Collection $collection, CollectionItem $item): Response
    {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);

        $revisions = $item->revisions()
            ->with('user:id,first_name,last_name,email')
            ->limit(50)
            ->get()
            ->map(fn (CollectionItemRevision $revision): array => [
                'id' => $revision->id,
                'user' => $revision->user ? [
                    'id' => $revision->user->id,
                    'name' => trim(($revision->user->first_name ?? '').' '.($revision->user->last_name ?? '')) ?: $revision->user->email,
                ] : null,
                'created_at' => $revision->created_at?->toIso8601String(),
                'meta' => $revision->meta,
                'data' => $revision->data,
            ]);

        return Inertia::render('collections/items/revisions', [
            'collection' => $collection->only(['id', 'name', 'slug']),
            'item' => ['id' => $item->id],
            'revisions' => $revisions,
        ]);
    }

    public function restore(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemRevision $revision,
    ): RedirectResponse {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        abort_unless((int) $revision->item_id === (int) $item->id, 404);

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $normalized = $this->normalizer->normalize($collection, $revision->data ?? [], false);
        $this->writer->sync($item, $collection, $normalized);

        return redirect()
            ->route('collections.items.show', [$collection, $item])
            ->with('success', __('Revision restored.'));
    }
}
