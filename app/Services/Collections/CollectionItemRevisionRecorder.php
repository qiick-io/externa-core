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
        private CollectionItemRevisionPruner $pruner,
    ) {}

    /**
     * @param  array<string, mixed>|null  $meta
     * @param  array<string, mixed>|null  $data  Snapshot override (defaults to assembled published values)
     */
    public function record(CollectionItem $item, ?array $meta = null, ?array $data = null): CollectionItemRevision
    {
        $revision = CollectionItemRevision::query()->create([
            'item_id' => $item->id,
            'user_id' => auth()->id(),
            'data' => $data ?? $this->assembler->assemble($item->fresh() ?? $item),
            'meta' => $meta,
            'created_at' => now(),
        ]);

        $this->pruner->pruneItem($item);

        return $revision;
    }
}
