<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * Database notification when async file duplication completes successfully.
 */
class FileDuplicationCompletedNotification extends Notification
{
    public function __construct(
        public readonly string $jobId,
        public readonly int $count,
        public readonly ?int $firstFileId,
        public readonly ?string $firstFilePath,
        public readonly ?int $folderId,
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
        $title = $this->count === 1
            ? 'File duplication completed'
            : "Duplicated {$this->count} items";

        return [
            'type' => 'file_duplication_completed',
            'title' => $title,
            'body' => $this->firstFilePath !== null
                ? "Created copy at {$this->firstFilePath}"
                : 'Your files were duplicated successfully.',
            'job_id' => $this->jobId,
            'count' => $this->count,
            'file_id' => $this->firstFileId,
            'path' => $this->firstFilePath,
            'folder_id' => $this->folderId,
        ];
    }
}
