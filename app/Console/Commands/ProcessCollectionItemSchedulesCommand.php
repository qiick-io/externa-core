<?php

namespace App\Console\Commands;

use App\Enums\PermissionEnum;
use App\Models\CollectionItem;
use App\Models\User;
use App\Notifications\ItemScheduleFailedNotification;
use App\Services\Collections\CollectionItemPublisher;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

#[Signature('collections:process-schedules')]
#[Description('Promote due drafts and soft-delete items past unpublish_at')]
/**
 * Poll scheduled publish / unpublish timestamps on collection items.
 */
class ProcessCollectionItemSchedulesCommand extends Command
{
    public function handle(
        CollectionItemPublisher $publisher,
        OutboundWebhookDispatcher $webhooks,
    ): int {
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
            ->each(function (CollectionItem $item) use ($publisher, $webhooks, &$published): void {
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
