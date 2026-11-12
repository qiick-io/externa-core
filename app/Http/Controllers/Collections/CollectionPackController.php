<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ApplyCollectionPackRequest;
use App\Models\Collection;
use App\Services\Collections\ApplyCollectionPackService;
use Illuminate\Http\RedirectResponse;

/**
 * Apply a registered collection pack from the collections list.
 */
class CollectionPackController extends Controller
{
    /**
     * Apply a registered collection pack (auto-create dependencies, skip existing fields).
     */
    public function applyPack(
        ApplyCollectionPackRequest $request,
        string $pack,
        ApplyCollectionPackService $applyCollectionPack,
    ): RedirectResponse {
        $validated = $request->validated();

        $result = $applyCollectionPack->apply($pack, [
            'name' => $validated['name'] ?? null,
            'slug' => $validated['slug'] ?? null,
        ]);

        $collection = Collection::query()->findOrFail($result['collection']['id']);
        $createdFields = count($result['created_fields']) + count($result['created_relations']);
        $skippedFields = count($result['skipped_fields']) + count($result['skipped_relations']);

        $message = $result['collection']['created']
            ? __('Collection pack applied: :name created with :created field(s) (:skipped skipped).', [
                'name' => $collection->name,
                'created' => $createdFields,
                'skipped' => $skippedFields,
            ])
            : __('Collection pack applied on existing :name: :created field(s) created, :skipped skipped.', [
                'name' => $collection->name,
                'created' => $createdFields,
                'skipped' => $skippedFields,
            ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $message);
    }
}
