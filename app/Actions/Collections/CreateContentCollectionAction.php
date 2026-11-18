<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;

/**
 * Create a collection; a singleton collection gets its single (empty) item right away,
 * so its editor always has a row to update.
 */
final class CreateContentCollectionAction
{
    /**
     * @param  array<string, mixed>  $validated  `StoreContentCollectionRequest::validated()`
     */
    public function execute(array $validated): Collection
    {
        $collection = Collection::query()->create($validated);

        if ($collection->is_singleton) {
            $collection->items()->create([]);
        }

        return $collection;
    }
}
