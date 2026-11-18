<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\ReorderCollectionFieldsAction;
use App\Actions\Collections\ToggleCollectionFieldFormVisibilityAction;
use App\Actions\Collections\UpdateCollectionFieldLayoutWidthAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ReorderFieldsRequest;
use App\Http\Requests\Collections\UpdateCollectionFormLayoutRequest;
use App\Http\Requests\Collections\UpdateFieldLayoutWidthRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Traits\AssertsFieldBelongsToCollectionTrait;
use Illuminate\Http\RedirectResponse;

/**
 * Presentation of collection fields on the item form: order, row breaks, groups, width,
 * visibility and the collection-level form layout (tabs + sections).
 */
class FieldLayoutController extends Controller
{
    use AssertsFieldBelongsToCollectionTrait;

    /**
     * Reorder fields and persist row-break layout settings.
     */
    public function reorder(
        ReorderFieldsRequest $request,
        Collection $collection,
        ReorderCollectionFieldsAction $reorderCollectionFields,
    ): RedirectResponse {
        $ids = array_map('intval', $request->validated('ids'));
        /** @var list<int> $startsNewRowIds */
        $startsNewRowIds = array_map('intval', $request->validated('starts_new_row_ids', []));
        /** @var array<int|string, string|null> $groups */
        $groups = $request->validated('groups', []);

        $reorderCollectionFields->execute($collection, $ids, $startsNewRowIds, $groups);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Fields reordered.'));
    }

    /**
     * Toggle whether a field is hidden on the item form.
     */
    public function toggleFormVisibility(
        Collection $collection,
        CollectionField $field,
        ToggleCollectionFieldFormVisibilityAction $toggleFormVisibility,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $willHide = $toggleFormVisibility->execute($field);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $willHide
                ? __('Field hidden in item form.')
                : __('Field shown in item form.'));
    }

    /**
     * Update the layout width setting for a field.
     */
    public function updateLayoutWidth(
        UpdateFieldLayoutWidthRequest $request,
        Collection $collection,
        CollectionField $field,
        UpdateCollectionFieldLayoutWidthAction $updateLayoutWidth,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $updateLayoutWidth->execute($field, $request->validated('layout_width'));

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field layout width updated.'));
    }

    /**
     * Persist collection-level form layout (tabs + sections). Presentation only.
     */
    public function updateFormLayout(
        UpdateCollectionFormLayoutRequest $request,
        Collection $collection,
    ): RedirectResponse {
        $collection->update([
            // passedValidation already normalized + merged form_layout onto the request.
            'form_layout' => $request->input('form_layout'),
        ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Form layout updated.'));
    }
}
