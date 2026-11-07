<?php

namespace App\Services\Collections;

use App\Models\CollectionItem;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Point-in-time Live Preview resolution for a single collection item.
 *
 * Scope (v1): the token target item only. Related items / list endpoints are
 * not simulated — when the published resource path is used, `?include=` still
 * hydrates relations as they are now. Draft overlay returns flat draft_data
 * without relation hydration.
 *
 * Overlay rules at {@see $asOf}:
 * - hide when `unpublish_at <= as_of`
 * - use `draft_data` when `publish_at <= as_of` and draft exists
 * - otherwise use current published values when the item is already published
 * - never-published items without a due publish are hidden
 */
class LivePreviewAsOfResolverService
{
    public const int MAX_AHEAD_DAYS = 90;

    /**
     * Parse an ISO-8601 / datetime string and enforce the max-ahead bound.
     *
     * @throws InvalidArgumentException when empty, unparseable, or beyond the bound
     */
    public function parseBounded(string $asOf): Carbon
    {
        $trimmed = trim($asOf);
        if ($trimmed === '') {
            throw new InvalidArgumentException('as_of must be a non-empty ISO-8601 timestamp.');
        }

        try {
            $moment = Carbon::parse($trimmed);
        } catch (\Throwable) {
            throw new InvalidArgumentException('as_of must be a valid ISO-8601 timestamp.');
        }

        $this->assertWithinBound($moment);

        return $moment;
    }

    /**
     * Reject timestamps more than {@see MAX_AHEAD_DAYS} ahead of now.
     *
     * @throws InvalidArgumentException
     */
    public function assertWithinBound(CarbonInterface $asOf): void
    {
        $max = now()->addDays(self::MAX_AHEAD_DAYS);
        if ($asOf->greaterThan($max)) {
            throw new InvalidArgumentException(sprintf(
                'as_of may be at most %d days ahead.',
                self::MAX_AHEAD_DAYS,
            ));
        }
    }

    /**
     * Resolve visibility and whether draft_data should overlay published values.
     *
     * @return array{visible: bool, use_draft: bool}
     */
    public function resolve(CollectionItem $item, CarbonInterface $asOf): array
    {
        if ($item->unpublish_at !== null && $item->unpublish_at->lessThanOrEqualTo($asOf)) {
            return ['visible' => false, 'use_draft' => false];
        }

        $willPublish = is_array($item->draft_data)
            && $item->publish_at !== null
            && $item->publish_at->lessThanOrEqualTo($asOf);

        if ($willPublish) {
            return ['visible' => true, 'use_draft' => true];
        }

        if ($this->isCurrentlyPublished($item)) {
            return ['visible' => true, 'use_draft' => false];
        }

        return ['visible' => false, 'use_draft' => false];
    }

    /**
     * Treat an item as live when it has a promote timestamp or stored field values.
     */
    private function isCurrentlyPublished(CollectionItem $item): bool
    {
        if ($item->published_at !== null) {
            return true;
        }

        return $item->fieldValues()->exists();
    }
}
