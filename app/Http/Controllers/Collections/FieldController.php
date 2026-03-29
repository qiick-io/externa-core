<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ReorderFieldsRequest;
use App\Http\Requests\Collections\StoreFieldRequest;
use App\Http\Requests\Collections\UpdateFieldRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class FieldController extends Controller
{
    public function index(Collection $collection): Response
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        return Inertia::render('collections/collections/fields', [
            'collection' => $collection,
        ]);
    }

    public function store(StoreFieldRequest $request, Collection $collection): RedirectResponse
    {
        $collection->fields()->create([
            ...$request->validated(),
            'translatable' => $request->boolean('translatable'),
        ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field created.'));
    }

    public function update(UpdateFieldRequest $request, Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $field->update([
            ...$request->validated(),
            'translatable' => $request->has('translatable') ? $request->boolean('translatable') : $field->translatable,
        ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field updated.'));
    }

    public function destroy(Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $field->delete();

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field deleted.'));
    }

    public function reorder(ReorderFieldsRequest $request, Collection $collection): RedirectResponse
    {
        $ids = $request->validated('ids');

        CollectionField::setNewOrder($ids, 1, null, fn ($query) => $query->where('collection_id', $collection->id));

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Fields reordered.'));
    }

    private function assertFieldBelongsToCollection(Collection $collection, CollectionField $field): void
    {
        abort_if($field->collection_id !== $collection->id, 404);
    }
}
