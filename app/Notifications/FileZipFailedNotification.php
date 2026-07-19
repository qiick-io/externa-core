<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * Database notification when async zip preparation fails.
 */
class FileZipFailedNotification extends Notification
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
            'type' => 'file_zip_failed',
            'title' => 'Zip preparation failed',
            'body' => $this->message !== ''
                ? $this->message
                : 'Something went wrong while preparing your zip download.',
            'job_id' => $this->jobId,
            'folder_id' => null,
        ];
    }
}
