<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\CollectionItem;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

/**
 * Run a bulk delete (soft), restore or force-delete on already authorized collection items.
 *
 * All items change in one transaction: a failure part-way leaves none of them changed.
 */
final class ApplyCollectionItemBulkAction
{
    /**
     * @param  'delete'|'restore'|'force_delete'  $action
     * @param  EloquentCollection<int, CollectionItem>  $items
     */
    public function execute(string $action, EloquentCollection $items): void
    {
        CollectionItem::query()->getConnection()->transaction(function () use ($items, $action): void {
            foreach ($items as $item) {
                match ($action) {
                    'delete' => $item->delete(),
                    'restore' => $item->restore(),
                    'force_delete' => $item->forceDelete(),
                };
            }
        });
    }
}
