<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Collections\CreateCollectionFieldAction;
use App\Actions\Collections\DeleteCollectionFieldAction;
use App\Actions\Collections\DuplicateCollectionFieldAction;
use App\Actions\Collections\UpdateCollectionFieldAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\StoreFieldRequest;
use App\Http\Requests\Collections\UpdateFieldRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldStorageShapeService;
use App\Services\Collections\FieldPacks\FieldPackRegistryService;
use App\Traits\AssertsFieldBelongsToCollectionTrait;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Collection field definitions: the field builder page and field create / update / delete /
 * duplicate. Ordering and form layout live in FieldLayoutController, type conversion in
 * FieldConvertController, field packs in FieldPackController.
 */
class FieldController extends Controller
{
    use AssertsFieldBelongsToCollectionTrait;

    /**
     * Render the field builder for a collection.
     */
    public function index(Collection $collection): Response
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $storedValueFlags = app(CollectionFieldStorageShapeService::class)
            ->storedValueFlagsByFieldId($collection);

        $collection->fields->each(function (CollectionField $field) use ($storedValueFlags): void {
            $field->setAttribute(
                'has_stored_values',
                (bool) ($storedValueFlags[(int) $field->id] ?? false),
            );
        });

        $relatedCollections = Collection::query()
            ->active()
            ->whereKeyNot($collection->id)
            ->ordered()
            ->get(['id', 'name', 'slug']);

        return Inertia::render('collections/collections/fields', [
            'collection' => $collection,
            'relatedCollections' => $relatedCollections,
            'fieldPacks' => FieldPackRegistryService::summaries(),
        ]);
    }

    /**
     * Create a field on the collection.
     */
    public function store(
        StoreFieldRequest $request,
        Collection $collection,
        CreateCollectionFieldAction $createCollectionField,
    ): RedirectResponse {
        $createCollectionField->execute($collection, $request->validated(), $request->boolean('translatable'));

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field created.'));
    }

    /**
     * Update a collection field definition.
     */
    public function update(
        UpdateFieldRequest $request,
        Collection $collection,
        CollectionField $field,
        UpdateCollectionFieldAction $updateCollectionField,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $updateCollectionField->execute(
            $collection,
            $field,
            $request->validated(),
            $request->has('translatable') ? $request->boolean('translatable') : null,
        );

        return redirect()
            ->to(url()->previous(route('collections.fields.index', $collection)))
            ->with('success', __('Field updated.'));
    }

    /**
     * Delete a collection field.
     */
    public function destroy(
        Collection $collection,
        CollectionField $field,
        DeleteCollectionFieldAction $deleteCollectionField,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $deleteCollectionField->execute($collection, $field);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field deleted.'));
    }

    /**
     * Duplicate a field with a unique generated name.
     */
    public function duplicate(
        Collection $collection,
        CollectionField $field,
        DuplicateCollectionFieldAction $duplicateCollectionField,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $duplicateCollectionField->execute($collection, $field);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field duplicated.'));
    }
}
