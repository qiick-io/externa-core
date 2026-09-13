<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabase;
use Illuminate\Notifications\Notification;

/**
 * Database notification when an async zip download is ready.
 */
class FileZipReadyNotification extends Notification
{
    use BroadcastsWithDatabase;

    public function __construct(
        public readonly string $jobId,
        public readonly string $downloadUrl,
        public readonly string $expiresAt,
        public readonly int $fileCount,
        public readonly ?int $zipBytes,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'file_zip_ready',
            'title' => 'Your zip is ready',
            'body' => $this->fileCount === 1
                ? 'Your zip download is ready.'
                : "Your zip of {$this->fileCount} items is ready.",
            'job_id' => $this->jobId,
            'download_url' => $this->downloadUrl,
            'expires_at' => $this->expiresAt,
            'count' => $this->fileCount,
            'zip_bytes' => $this->zipBytes,
            'folder_id' => null,
        ];
    }
}
