<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * List, compare, and restore collection item revisions.
 */
class ItemRevisionController extends Controller
{
    private const DEFAULT_PER_PAGE = 20;

    private const MAX_PER_PAGE = 100;

    public function __construct(
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemValuesWriter $writer,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    public function index(Request $request, Collection $collection, CollectionItem $item): Response|JsonResponse
    {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

        $validated = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);

        $perPage = min(
            max((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE), 1),
            self::MAX_PER_PAGE,
        );
        $dateFrom = isset($validated['date_from']) ? (string) $validated['date_from'] : '';
        $dateTo = isset($validated['date_to']) ? (string) $validated['date_to'] : '';

        $query = $item->revisions()
            ->with('user:id,first_name,last_name,email');

        if ($dateFrom !== '') {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $paginator = $query->paginate($perPage);

        $revisions = collect($paginator->items())
            ->map(fn (CollectionItemRevision $revision): array => [
                'id' => $revision->id,
                'user' => $revision->user ? [
                    'id' => $revision->user->id,
                    'name' => trim(($revision->user->first_name ?? '').' '.($revision->user->last_name ?? '')) ?: $revision->user->email,
                ] : null,
                'created_at' => $revision->created_at?->toIso8601String(),
                'meta' => $revision->meta,
                'data' => $revision->data,
                'summary' => $this->revisionSummary($revision),
            ])
            ->values()
            ->all();

        $meta = [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'has_more' => $paginator->hasMorePages(),
        ];

        $filters = [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
        ];

        if ($request->wantsJson() || $request->boolean('json')) {
            return response()->json([
                'collection' => $collection->only(['id', 'name', 'slug']),
                'item' => ['id' => $item->id],
                'revisions' => $revisions,
                'meta' => $meta,
                'filters' => $filters,
            ]);
        }

        return Inertia::render('collections/items/revisions', [
            'collection' => $collection->only(['id', 'name', 'slug']),
            'item' => ['id' => $item->id],
            'revisions' => $revisions,
            'meta' => $meta,
            'filters' => $filters,
        ]);
    }

    /**
     * Short label for drawer rows (changed field count when meta lacks a message).
     */
    private function revisionSummary(CollectionItemRevision $revision): string
    {
        $meta = is_array($revision->meta) ? $revision->meta : [];
        $source = isset($meta['source']) && is_string($meta['source']) ? $meta['source'] : null;
        $version = isset($meta['version']) && is_string($meta['version']) ? $meta['version'] : null;

        if ($source === 'publish') {
            return 'Published';
        }
        if ($source === 'draft') {
            return 'Draft saved';
        }
        if ($source === 'restore') {
            return 'Hard restore';
        }

        $keys = is_array($revision->data) ? count($revision->data) : 0;

        return $version !== null
            ? sprintf('%s · %d fields', ucfirst($version), $keys)
            : sprintf('%d fields', $keys);
    }

    public function restore(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemRevision $revision,
    ): RedirectResponse {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        abort_unless((int) $revision->item_id === (int) $item->id, 404);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $data = is_array($revision->data) ? $revision->data : [];
        $this->permissionEnforcer->assertWritableFields(
            $request,
            $collection,
            $data,
            'update',
        );

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $normalized = $this->normalizer->normalize($collection, $data, false);
        $this->writer->sync($item, $collection, $normalized);

        // Versioning: align draft workspace with restored published values (like after publish).
        if ($collection->versioning) {
            $item->draft_data = null;
            $item->save();
        }

        return redirect()
            ->route('collections.items.show', array_filter([
                'collection' => $collection,
                'item' => $item,
                'version' => $collection->versioning ? 'draft' : null,
            ]))
            ->with('success', __('Revision restored.'));
    }
}
