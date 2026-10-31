<?php

namespace App\Console\Commands;

use App\Enums\PermissionEnum;
use App\Models\CollectionItem;
use App\Models\User;
use App\Notifications\ItemScheduleFailedNotification;
use App\Services\Collections\CollectionItemPublisher;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Carbon\CarbonInterface;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Throwable;

#[Signature('collections:process-schedules')]
#[Description('Promote due drafts and soft-delete items past unpublish_at')]
/**
 * Poll scheduled publish / unpublish timestamps on collection items.
 */
class ProcessCollectionItemSchedulesCommand extends Command
{
    private const int BATCH_SIZE = 100;

    private const int MAX_BATCHES = 50;

    public function handle(
        CollectionItemPublisher $publisher,
        OutboundWebhookDispatcher $webhooks,
    ): int {
        $now = now();
        $published = 0;
        $unpublished = 0;

        $published += $this->processDuePublishes($publisher, $webhooks, $now);
        $unpublished += $this->processDueUnpublishes($now);

        $this->info(sprintf('Published %d, unpublished %d.', $published, $unpublished));

        return self::SUCCESS;
    }

    private function processDuePublishes(
        CollectionItemPublisher $publisher,
        OutboundWebhookDispatcher $webhooks,
        CarbonInterface $now,
    ): int {
        $published = 0;

        for ($batch = 0; $batch < self::MAX_BATCHES; $batch++) {
            $items = CollectionItem::query()
                ->with('collection')
                ->whereNotNull('publish_at')
                ->where('publish_at', '<=', $now)
                ->whereNotNull('draft_data')
                ->orderBy('id')
                ->limit(self::BATCH_SIZE)
                ->get();

            if ($items->isEmpty()) {
                break;
            }

            foreach ($items as $item) {
                $collection = $item->collection;
                if ($collection === null || ! $collection->versioning) {
                    $item->publish_at = null;
                    $item->save();

                    continue;
                }

                try {
                    $publisher->promote($item, $collection, scheduled: true);
                    $published++;
                } catch (Throwable $e) {
                    report($e);

                    $message = $e->getMessage();
                    // Keep paired unpublish_at so editors still see the soft-delete schedule.
                    $item->publish_at = null;
                    $item->schedule_error = $message;
                    $item->schedule_failed_at = Carbon::now();
                    $item->save();

                    $fresh = $item->fresh();
                    if ($fresh !== null) {
                        $webhooks->dispatchItem('item.publish_failed', $fresh, $collection, [
                            'error' => $message,
                        ]);
                        $this->notifyScheduleFailure($fresh, $collection->name, $message);
                    }
                }
            }

            if ($items->count() < self::BATCH_SIZE) {
                break;
            }
        }

        return $published;
    }

    private function processDueUnpublishes(CarbonInterface $now): int
    {
        $unpublished = 0;

        for ($batch = 0; $batch < self::MAX_BATCHES; $batch++) {
            $items = CollectionItem::query()
                ->whereNotNull('unpublish_at')
                ->where('unpublish_at', '<=', $now)
                ->orderBy('id')
                ->limit(self::BATCH_SIZE)
                ->get();

            if ($items->isEmpty()) {
                break;
            }

            foreach ($items as $item) {
                try {
                    $item->unpublish_at = null;
                    $item->save();
                    $item->delete();
                    $unpublished++;
                } catch (Throwable $e) {
                    report($e);
                }
            }

            if ($items->count() < self::BATCH_SIZE) {
                break;
            }
        }

        return $unpublished;
    }

    private function notifyScheduleFailure(
        CollectionItem $item,
        string $collectionName,
        string $errorMessage,
    ): void {
        $recipients = User::permission(PermissionEnum::CanApproveCollections->value)->get();

        $editorOrSubmitterId = $item->user_updated_id ?? $item->submitted_by;
        if (is_int($editorOrSubmitterId) && ! $recipients->contains('id', $editorOrSubmitterId)) {
            $editor = User::query()->find($editorOrSubmitterId);
            if ($editor !== null) {
                $recipients->push($editor);
            }
        }

        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients->unique('id')->values(), new ItemScheduleFailedNotification(
            collectionId: $item->collection_id,
            collectionName: $collectionName,
            itemId: $item->id,
            errorMessage: $errorMessage,
        ));
    }
}
