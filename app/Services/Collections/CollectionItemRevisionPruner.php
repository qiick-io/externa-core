<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Services\Settings\ProjectSettings;

/**
 * Hard-delete revision history rows past effective retention limits.
 *
 * Precedence per axis: collection value if set, else project default, else unlimited.
 * Policy when both effective limits are set: age first, then keep newest N.
 * Never touches live items / draft_data.
 */
class CollectionItemRevisionPruner
{
    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * Prune revisions for a single item using effective collection/global limits.
     */
    public function pruneItem(CollectionItem $item): int
    {
        $item->loadMissing('collection');

        $collection = $item->collection;
        if (! $collection instanceof Collection) {
            return 0;
        }

        [$count, $days] = $this->effectiveLimits($collection);

        return $this->pruneItemWithLimits((int) $item->id, $count, $days);
    }

    /**
     * Prune all items in collections whose effective limits are not both unlimited.
     */
    public function pruneAll(): int
    {
        $deleted = 0;
        $globalCount = $this->projectSettings->revisionRetentionCount();
        $globalDays = $this->projectSettings->revisionRetentionDays();
        $hasGlobal = $globalCount !== null || $globalDays !== null;

        $query = Collection::query()
            ->select(['id', 'revision_retention_count', 'revision_retention_days']);

        if (! $hasGlobal) {
            $query->where(function ($q): void {
                $q->whereNotNull('revision_retention_count')
                    ->orWhereNotNull('revision_retention_days');
            });
        }

        $query->chunkById(50, function ($collections) use (&$deleted): void {
            foreach ($collections as $collection) {
                /** @var Collection $collection */
                [$count, $days] = $this->effectiveLimits($collection);

                if ($count === null && $days === null) {
                    continue;
                }

                CollectionItem::query()
                    ->where('collection_id', $collection->id)
                    ->select(['id'])
                    ->chunkById(200, function ($items) use ($count, $days, &$deleted): void {
                        foreach ($items as $item) {
                            $deleted += $this->pruneItemWithLimits(
                                (int) $item->id,
                                $count,
                                $days,
                            );
                        }
                    });
            }
        });

        return $deleted;
    }

    /**
     * @return array{0: int|null, 1: int|null}
     */
    private function effectiveLimits(Collection $collection): array
    {
        return [
            $collection->revision_retention_count
                ?? $this->projectSettings->revisionRetentionCount(),
            $collection->revision_retention_days
                ?? $this->projectSettings->revisionRetentionDays(),
        ];
    }

    private function pruneItemWithLimits(int $itemId, ?int $count, ?int $days): int
    {
        if ($count === null && $days === null) {
            return 0;
        }

        $deleted = 0;

        if ($days !== null) {
            $deleted += CollectionItemRevision::query()
                ->where('item_id', $itemId)
                ->where('created_at', '<', now()->subDays($days))
                ->delete();
        }

        if ($count !== null) {
            $keepIds = CollectionItemRevision::query()
                ->where('item_id', $itemId)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit($count)
                ->pluck('id');

            if ($keepIds->isNotEmpty()) {
                $deleted += CollectionItemRevision::query()
                    ->where('item_id', $itemId)
                    ->whereNotIn('id', $keepIds)
                    ->delete();
            }
        }

        return $deleted;
    }
}
