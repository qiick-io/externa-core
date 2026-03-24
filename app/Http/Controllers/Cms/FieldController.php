<?php

namespace App\Http\Controllers\Cms;

use App\Http\Controllers\Controller;
use App\Http\Requests\Cms\ReorderFieldsRequest;
use App\Http\Requests\Cms\StoreFieldRequest;
use App\Http\Requests\Cms\UpdateFieldRequest;
use App\Models\ContentCollection;
use App\Models\Field;
use Illuminate\Http\RedirectResponse;

class FieldController extends Controller
{
    public function store(StoreFieldRequest $request, ContentCollection $collection): RedirectResponse
    {
        $collection->fields()->create([
            ...$request->validated(),
            'translatable' => $request->boolean('translatable'),
        ]);

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Field created.'));
    }

    public function update(UpdateFieldRequest $request, ContentCollection $collection, Field $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $field->update([
            ...$request->validated(),
            'translatable' => $request->has('translatable') ? $request->boolean('translatable') : $field->translatable,
        ]);

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Field updated.'));
    }

    public function destroy(ContentCollection $collection, Field $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $field->delete();

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Field deleted.'));
    }

    public function reorder(ReorderFieldsRequest $request, ContentCollection $collection): RedirectResponse
    {
        $ids = $request->validated('ids');

        Field::setNewOrder($ids, 1, null, fn ($query) => $query->where('collection_id', $collection->id));

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Fields reordered.'));
    }

    private function assertFieldBelongsToCollection(ContentCollection $collection, Field $field): void
    {
        abort_if($field->collection_id !== $collection->id, 404);
    }
}
