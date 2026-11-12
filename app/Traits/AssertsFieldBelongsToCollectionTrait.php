<?php

declare(strict_types=1);

namespace App\Traits;

use App\Models\Collection;
use App\Models\CollectionField;

/**
 * Route guard shared by the collection field controllers: `{collection}` and `{field}`
 * are bound independently, so a field from another collection must 404 instead of
 * being read or changed through the wrong collection.
 */
trait AssertsFieldBelongsToCollectionTrait
{
    /**
     * Abort when the field does not belong to the route collection.
     */
    private function assertFieldBelongsToCollection(Collection $collection, CollectionField $field): void
    {
        abort_if($field->collection_id !== $collection->id, 404);
    }
}
