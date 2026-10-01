<?php

namespace App\Console\Commands;

use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemPublisher;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

#[Signature('collections:process-schedules')]
#[Description('Promote due drafts and soft-delete items past unpublish_at')]
/**
 * Poll scheduled publish / unpublish timestamps on collection items.
 */
class ProcessCollectionItemSchedulesCommand extends Command
{
    public function handle(CollectionItemPublisher $publisher): int
    {
        $now = now();
        $published = 0;
        $unpublished = 0;

        CollectionItem::query()
            ->with('collection')
            ->whereNotNull('publish_at')
            ->where('publish_at', '<=', $now)
            ->whereNotNull('draft_data')
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->each(function (CollectionItem $item) use ($publisher, &$published): void {
                $collection = $item->collection;
                if ($collection === null || ! $collection->versioning) {
                    $item->publish_at = null;
                    $item->save();

                    return;
                }

                try {
                    $publisher->promote($item, $collection, scheduled: true);
                    $published++;
                } catch (Throwable $e) {
                    Log::warning('Scheduled publish failed', [
                        'item_id' => $item->id,
                        'message' => $e->getMessage(),
                    ]);
                    $item->publish_at = null;
                    $item->save();
                }
            });

        CollectionItem::query()
            ->whereNotNull('unpublish_at')
            ->where('unpublish_at', '<=', $now)
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->each(function (CollectionItem $item) use (&$unpublished): void {
                $item->unpublish_at = null;
                $item->save();
                $item->delete();
                $unpublished++;
            });

        $this->info(sprintf('Published %d, unpublished %d.', $published, $unpublished));

        return self::SUCCESS;
    }
}
