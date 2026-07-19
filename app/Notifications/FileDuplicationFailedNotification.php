<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * Database notification when async file duplication fails.
 */
class FileDuplicationFailedNotification extends Notification
{
    public function __construct(
        public readonly string $jobId,
        public readonly string $message,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'file_duplication_failed',
            'title' => 'File duplication failed',
            'body' => $this->message !== ''
                ? $this->message
                : 'Something went wrong while duplicating your files.',
            'job_id' => $this->jobId,
            'folder_id' => null,
        ];
    }
}
