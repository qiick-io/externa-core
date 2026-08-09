<?php

namespace App\Http\Controllers\Collections;

use App\Enums\FieldTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ApplyFieldPackRequest;
use App\Http\Requests\Collections\ReorderFieldsRequest;
use App\Http\Requests\Collections\StoreFieldRequest;
use App\Http\Requests\Collections\UpdateCollectionFormLayoutRequest;
use App\Http\Requests\Collections\UpdateFieldLayoutWidthRequest;
use App\Http\Requests\Collections\UpdateFieldRequest;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\ApplyFieldPackService;
use App\Services\Collections\CollectionFieldGroupService;
use App\Support\Collections\FieldPacks\FieldPackRegistry;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Manage collection field definitions, layout, and ordering.
 */
class FieldController extends Controller
{
    /**
     * Render the field builder for a collection.
     */
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
            'fieldPacks' => FieldPackRegistry::summaries(),
        ]);
    }

    /**
     * Apply a registered field pack (create missing fields, skip existing names).
     */
    public function applyPack(
        ApplyFieldPackRequest $request,
        Collection $collection,
        string $pack,
        ApplyFieldPackService $applyFieldPack,
    ): RedirectResponse {
        $result = $applyFieldPack->apply($collection, $pack);

        $createdCount = count($result['created']);
        $skippedCount = count($result['skipped']);

        $message = $createdCount === 0 && $skippedCount > 0
            ? __(':skipped field(s) already existed — nothing created.', ['skipped' => $skippedCount])
            : __(':created field(s) created, :skipped skipped.', [
                'created' => $createdCount,
                'skipped' => $skippedCount,
            ]);

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', $message);
    }

    /**
     * Create a field on the collection.
     */
    public function store(StoreFieldRequest $request, Collection $collection): RedirectResponse
    {
        $validated = $request->validated();
        $type = $validated['type'] instanceof FieldTypeEnum
            ? $validated['type']
            : FieldTypeEnum::from((string) $validated['type']);

        if (isset($validated['settings']) && is_array($validated['settings'])) {
            $validated['settings'] = app(CollectionFieldGroupService::class)
                ->forceFullWidthForGroup($type, $validated['settings']);
        } elseif ($type->isLayoutGroup()) {
            $validated['settings'] = ['layout_width' => 'full'];
        }

        /** @var CollectionField $field */
        $field = $collection->fields()->create([
            ...$validated,
            'translatable' => $type->supportsTranslatable() && $request->boolean('translatable'),
        ]);

        $groupService = app(CollectionFieldGroupService::class);

        // Directus UX: Accordion/Tabs need section panels before fields can nest.
        $groupService->seedDefaultPanelSections($collection, $field);

        // Creating a leaf with settings.group = accordion|tabs → wrap in a Raw section.
        if (! $type->isLayoutGroup()) {
            $groupService->wrapLeafUnderPanelIfNeeded($collection, $field);
        }

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field created.'));
    }

    /**
     * Update a collection field definition.
     */
    public function update(UpdateFieldRequest $request, Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $oldName = $field->name;
        $validated = $request->validated();
        $type = isset($validated['type'])
            ? ($validated['type'] instanceof FieldTypeEnum
                ? $validated['type']
                : FieldTypeEnum::from((string) $validated['type']))
            : $field->type;

        $translatable = $request->has('translatable')
            ? $request->boolean('translatable')
            : $field->translatable;

        // Coerce legacy true flags when type cannot be per-locale.
        if (! $type->supportsTranslatable()) {
            $translatable = false;
        }

        if (isset($validated['settings']) && is_array($validated['settings'])) {
            $validated['settings'] = app(CollectionFieldGroupService::class)
                ->forceFullWidthForGroup($type, $validated['settings']);
        }

        $field->update([
            ...$validated,
            'translatable' => $translatable,
        ]);

        $newName = $field->fresh()->name;
        if ($type->isLayoutGroup() && $oldName !== $newName) {
            app(CollectionFieldGroupService::class)
                ->rewriteGroupNameReferences($collection, $oldName, $newName);
        }

        return redirect()
            ->to(url()->previous(route('collections.fields.index', $collection)))
            ->with('success', __('Field updated.'));
    }

    /**
     * Delete a collection field.
     */
    public function destroy(Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $wasGroup = $field->type->isLayoutGroup();
        $groupName = $field->name;

        $field->delete();

        if ($wasGroup) {
            app(CollectionFieldGroupService::class)->ungroupChildren($collection, $groupName);
        }

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field deleted.'));
    }

    /**
     * Reorder fields and persist row-break layout settings.
     *
     * Full `ids` order is accepted for correctness; only dirty sort_order /
     * settings rows are written (avoids activity-log + cache-bump storms).
     */
    public function reorder(ReorderFieldsRequest $request, Collection $collection): RedirectResponse
    {
        $ids = array_map('intval', $request->validated('ids'));
        /** @var list<int> $startsNewRowIds */
        $startsNewRowIds = array_map('intval', $request->validated('starts_new_row_ids', []));
        /** @var array<int|string, string|null> $groups */
        $groups = $request->validated('groups', []);

        $this->applySortOrderFromIds($collection, $ids);

        $startsNewRowIdSet = array_fill_keys($startsNewRowIds, true);
        $groupService = app(CollectionFieldGroupService::class);

        $fields = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids)
            ->get();

        foreach ($fields as $field) {
            $settings = $field->settings ?? [];
            $shouldStartNewRow = isset($startsNewRowIdSet[$field->id]);

            if ($shouldStartNewRow) {
                $settings['layout_starts_new_row'] = true;
            } else {
                unset($settings['layout_starts_new_row']);
            }

            if ($field->type->isLayoutGroup()) {
                $settings = $groupService->forceFullWidthForGroup($field->type, $settings);
            }

            $nextSettings = $settings === [] ? null : $settings;

            // ponytail: skip Eloquent update when settings unchanged — each update
            // bumps PublicApiResponseCache + activity log.
            if ($field->settings == $nextSettings) {
                continue;
            }

            $field->update(['settings' => $nextSettings]);
        }

        if ($groups !== []) {
            $groupService->applyGroupsFromReorder($collection, $groups);
        }

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Fields reordered.'));
    }

    /**
     * Persist sort_order for ids that actually moved (query builder, no model events).
     *
     * @param  list<int>  $ids
     */
    private function applySortOrderFromIds(Collection $collection, array $ids): void
    {
        if ($ids === []) {
            return;
        }

        $currentOrders = CollectionField::query()
            ->where('collection_id', $collection->id)
            ->whereIn('id', $ids)
            ->pluck('sort_order', 'id');

        $order = 1;

        foreach ($ids as $id) {
            if ((int) ($currentOrders[$id] ?? -1) !== $order) {
                CollectionField::query()
                    ->where('collection_id', $collection->id)
                    ->whereKey($id)
                    ->update(['sort_order' => $order]);
            }

            $order++;
        }
    }

    /**
     * Duplicate a field with a unique generated name.
     */
    public function duplicate(Collection $collection, CollectionField $field): RedirectResponse
    {
        $this->assertFieldBelongsToCollection($collection, $field);

        $duplicate = $field->replicate(['sort_order']);
        $duplicate->name = $this->uniqueDuplicateFieldName($collection, $field->name);
        $duplicate->save();

        return redirect()->route('collections.fields.index', $collection)
            ->with('success', __('Field duplicated.'));
    }

    /**
     * Toggle whether a field is hidden on the item form.
     */
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

    /**
     * Update the layout width setting for a field.
     */
    public function updateLayoutWidth(
        UpdateFieldLayoutWidthRequest $request,
        Collection $collection,
        CollectionField $field,
    ): RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $settings = $field->settings ?? [];
        $width = $request->validated('layout_width');
        if ($field->type->isLayoutGroup()) {
            $width = 'full';
        }
        $settings['layout_width'] = $width;
        $field->update(['settings' => $settings]);

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

    /**
     * Generate a unique duplicate field name within the collection.
     */
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

    /**
     * Abort when the field does not belong to the route collection.
     */
    private function assertFieldBelongsToCollection(Collection $collection, CollectionField $field): void
    {
        abort_if($field->collection_id !== $collection->id, 404);
    }
}
