<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabaseTrait;
use Illuminate\Notifications\Notification;

/**
 * Database notification when the async "empty trash" job completes.
 */
class FilesTrashEmptiedNotification extends Notification
{
    use BroadcastsWithDatabaseTrait;

    public function __construct(
        public readonly string $jobId,
        public readonly int $count,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'files_trash_emptied',
            'title' => 'Trash emptied',
            'body' => $this->count === 1
                ? 'Permanently deleted 1 item.'
                : "Permanently deleted {$this->count} items.",
            'job_id' => $this->jobId,
            'count' => $this->count,
        ];
    }
}
