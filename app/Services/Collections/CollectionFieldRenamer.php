<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use Illuminate\Support\Facades\DB;

/**
 * Single path for field updates that may rename a field.
 *
 * Published values are keyed by field_id (rename-safe). Drafts and revisions
 * store snapshots keyed by field name — on rename those keys must move too,
 * or publish/restore/kanban/calendar re-normalize drops the value.
 */
class CollectionFieldRenamer
{
    public function __construct(
        private CollectionFieldGroupService $groupService,
    ) {}

    /**
     * Persist field attributes. When `name` changes, rewrite draft_data and
     * revision `data` keys (including soft-deleted items) and layout-group
     * child `settings.group` pointers.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function update(Collection $collection, CollectionField $field, array $attributes): CollectionField
    {
        return DB::transaction(function () use ($collection, $field, $attributes): CollectionField {
            $oldName = $field->name;
            $field->update($attributes);
            $field = $field->fresh();

            if ($field === null) {
                throw new \RuntimeException('Field disappeared during update.');
            }

            $newName = $field->name;

            if ($oldName === $newName) {
                return $field;
            }

            $this->rewriteKeyedSnapshots($collection, $oldName, $newName);

            if ($field->type->isLayoutGroup()) {
                $this->groupService->rewriteGroupNameReferences($collection, $oldName, $newName);
            }

            return $field;
        });
    }

    private function rewriteKeyedSnapshots(Collection $collection, string $oldName, string $newName): void
    {
        $items = CollectionItem::withTrashed()
            ->where('collection_id', $collection->id)
            ->get(['id', 'draft_data']);

        foreach ($items as $item) {
            if (! is_array($item->draft_data) || ! array_key_exists($oldName, $item->draft_data)) {
                continue;
            }

            $item->draft_data = $this->remapKey($item->draft_data, $oldName, $newName);
            $item->save();
        }

        $itemIds = $items->pluck('id');
        if ($itemIds->isEmpty()) {
            return;
        }

        CollectionItemRevision::query()
            ->whereIn('item_id', $itemIds)
            ->orderBy('id')
            ->chunkById(100, function ($revisions) use ($oldName, $newName): void {
                foreach ($revisions as $revision) {
                    if (! is_array($revision->data) || ! array_key_exists($oldName, $revision->data)) {
                        continue;
                    }

                    $revision->data = $this->remapKey($revision->data, $oldName, $newName);
                    $revision->save();
                }
            });
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function remapKey(array $payload, string $oldName, string $newName): array
    {
        if (! array_key_exists($oldName, $payload)) {
            return $payload;
        }

        // Prefer an already-present new key (unlikely) over the stale old key.
        if (! array_key_exists($newName, $payload)) {
            $payload[$newName] = $payload[$oldName];
        }

        unset($payload[$oldName]);

        return $payload;
    }
}
