<?php

declare(strict_types=1);

namespace App\Traits;

use App\Models\Collection;
use App\Models\CollectionItem;

/**
 * Route guard shared by the collection item controllers: `{collection}` and `{item}`
 * are bound independently, so an item from another collection must 404 instead of
 * being read or changed through the wrong collection's grants.
 */
trait AssertsItemBelongsToCollectionTrait
{
    /**
     * Abort when the item does not belong to the route collection.
     */
    private function assertItemBelongsToCollection(Collection $collection, CollectionItem $item): void
    {
        abort_if($item->collection_id !== $collection->id, 404);
    }
}
