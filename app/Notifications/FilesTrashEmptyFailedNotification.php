<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabaseTrait;
use Illuminate\Notifications\Notification;

/**
 * Database notification when the async "empty trash" job fails.
 */
class FilesTrashEmptyFailedNotification extends Notification
{
    use BroadcastsWithDatabaseTrait;

    public function __construct(
        public readonly string $jobId,
        public readonly string $message,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'files_trash_empty_failed',
            'title' => 'Emptying the trash failed',
            'body' => $this->message !== ''
                ? $this->message
                : 'Something went wrong while emptying the trash.',
            'job_id' => $this->jobId,
        ];
    }
}
