<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ReorderFieldsRequest;
use App\Http\Requests\Collections\StoreFieldRequest;
use App\Http\Requests\Collections\UpdateFieldLayoutWidthRequest;
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

        $relatedCollections = Collection::query()
            ->whereKeyNot($collection->id)
            ->ordered()
            ->get(['id', 'name', 'slug']);

        return Inertia::render('collections/collections/fields', [
            'collection' => $collection,
            'relatedCollections' => $relatedCollections,
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
        /** @var list<int> $startsNewRowIds */
        $startsNewRowIds = $request->validated('starts_new_row_ids', []);

        CollectionField::setNewOrder($ids, 1, null, fn ($query) => $query->where('collection_id', $collection->id));

        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids)
            ->get();

        foreach ($fields as $field) {
            $settings = $field->settings ?? [];

            if (in_array($field->id, $startsNewRowIds, true)) {
                $settings['layout_starts_new_row'] = true;
            } else {
                unset($settings['layout_starts_new_row']);
            }

            $field->update(['settings' => $settings]);
        }

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Fields reordered.'));
    }

    public function duplicate(Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $duplicate = $field->replicate(['sort_order']);
        $duplicate->name = $this->uniqueDuplicateFieldName($collection, $field->name);
        $duplicate->save();

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field duplicated.'));
    }

    public function toggleFormVisibility(Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $settings = $field->settings ?? [];
        $willHide = ! $field->isHiddenInForm();
        $settings['hidden_in_form'] = $willHide;
        $field->update(['settings' => $settings]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $willHide
                ? __('Field hidden in item form.')
                : __('Field shown in item form.'));
    }

    public function updateLayoutWidth(
        UpdateFieldLayoutWidthRequest $request,
        Collection $collection,
        CollectionField $field,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $settings = $field->settings ?? [];
        $settings['layout_width'] = $request->validated('layout_width');
        $field->update(['settings' => $settings]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field layout width updated.'));
    }

    private function uniqueDuplicateFieldName(Collection $collection, string $baseName): string
    {
        $candidate = $baseName.'_copy';
        $suffix = 2;

        while ($collection->fields()->where('name', $candidate)->exists()) {
            $candidate = $baseName.'_copy_'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    private function assertFieldBelongsToCollection(Collection $collection, CollectionField $field): void
    {
        abort_if($field->collection_id !== $collection->id, 404);
    }
}
