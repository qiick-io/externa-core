<?php

namespace App\Services\Collections;

use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;

/**
 * Persist JSON snapshots of item data after successful writes.
 */
class CollectionItemRevisionRecorder
{
    public function __construct(
        private CollectionItemValuesAssembler $assembler,
    ) {}

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public function record(CollectionItem $item, ?array $meta = null): CollectionItemRevision
    {
        return CollectionItemRevision::query()->create([
            'item_id' => $item->id,
            'user_id' => auth()->id(),
            'data' => $this->assembler->assemble($item->fresh() ?? $item),
            'meta' => $meta,
            'created_at' => now(),
        ]);
    }
}
