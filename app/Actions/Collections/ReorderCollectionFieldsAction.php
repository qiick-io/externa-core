<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldGroupService;

/**
 * Reorder a collection's fields and persist the row-break and group layout settings.
 *
 * The full `ids` order is accepted for correctness, but only dirty `sort_order` /
 * `settings` rows are written: every Eloquent update bumps the public API response
 * cache and the activity log, so untouched rows must not be saved.
 */
final class ReorderCollectionFieldsAction
{
    public function __construct(
        private CollectionFieldGroupService $groupService,
    ) {}

    /**
     * @param  list<int>  $ids  field ids in their new order
     * @param  list<int>  $startsNewRowIds  fields that start a new form row
     * @param  array<int|string, string|null>  $groups  field id => parent group name (null = top level)
     */
    public function execute(Collection $collection, array $ids, array $startsNewRowIds, array $groups): void
    {
        $this->applySortOrderFromIds($collection, $ids);

        $startsNewRowIdSet = array_fill_keys($startsNewRowIds, true);

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
                $settings = $this->groupService->forceFullWidthForGroup($field->type, $settings);
            }

            $nextSettings = $settings === [] ? null : $settings;

            // ponytail: skip Eloquent update when settings unchanged — each update
            // bumps PublicApiResponseCacheService + activity log.
            if ($field->settings == $nextSettings) {
                continue;
            }

            $field->update(['settings' => $nextSettings]);
        }

        if ($groups !== []) {
            $this->groupService->applyGroupsFromReorder($collection, $groups);
        }
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
}
