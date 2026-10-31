<?php

namespace App\Jobs;

use App\Models\User;
use App\Notifications\FileZipFailedNotification;
use App\Notifications\FileZipReadyNotification;
use App\Services\FileService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Queued job that builds a zip archive and notifies the requesting user.
 */
class PrepareFilesZipJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 300;

    /**
     * @param  list<int>  $fileIds
     */
    public function __construct(
        public readonly int $userId,
        public readonly array $fileIds,
        public readonly string $jobUuid,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [30, 60];
    }

    /**
     * Build the zip on disk and notify the user with a download link.
     */
    public function handle(FileService $fileService): void
    {
        $user = User::query()->find($this->userId);

        if ($user === null) {
            return;
        }

        $zipPath = $fileService->buildZipArchive(
            $this->fileIds,
            $fileService->zipStoragePath($this->userId, $this->jobUuid),
        );

        $ttlMinutes = (int) config('files.zip_ttl_minutes', 60);
        $expiresAt = Carbon::now()->addMinutes($ttlMinutes);

        $user->notify(new FileZipReadyNotification(
            jobId: $this->jobUuid,
            downloadUrl: route('files.zips.download', $this->jobUuid),
            expiresAt: $expiresAt->toIso8601String(),
            fileCount: count($this->fileIds),
            zipBytes: is_file($zipPath) ? (int) filesize($zipPath) : null,
        ));
    }

    /**
     * Notify the requester once retries are exhausted (timeouts / hard failures).
     */
    public function failed(?Throwable $exception): void
    {
        report($exception);

        $user = User::query()->find($this->userId);
        if ($user === null) {
            return;
        }

        $user->notify(new FileZipFailedNotification(
            jobId: $this->jobUuid,
            message: $exception?->getMessage() ?? 'Zip preparation failed.',
        ));
    }
}
