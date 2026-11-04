<?php

namespace App\Jobs;

use App\Models\File;
use App\Models\User;
use App\Notifications\FilesTrashEmptiedNotification;
use App\Notifications\FilesTrashEmptyFailedNotification;
use App\Services\FileService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Queued job that permanently deletes every trashed file and folder, then
 * notifies the requesting user. Idempotent: rows already removed (with their
 * folder) or restored meanwhile are skipped, so a retry or an overlapping run
 * only finishes what is left.
 */
class EmptyFilesTrashJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 3600;

    public function __construct(
        public readonly int $userId,
        public readonly string $jobUuid,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [60];
    }

    /**
     * Force-delete each trashed row (storage, transforms, descendants) and
     * notify the user with the number of rows removed.
     */
    public function handle(FileService $fileService): void
    {
        $trashedFileIds = File::query()->onlyTrashed()->orderBy('id')->pluck('id');

        foreach ($trashedFileIds as $trashedFileId) {
            $trashedFile = File::query()->onlyTrashed()->find($trashedFileId);

            if ($trashedFile === null) {
                continue;
            }

            $fileService->forceDelete($trashedFile);
        }

        $remainingCount = File::query()->withTrashed()->whereIn('id', $trashedFileIds)->count();

        User::query()->find($this->userId)?->notify(new FilesTrashEmptiedNotification(
            jobId: $this->jobUuid,
            count: $trashedFileIds->count() - $remainingCount,
        ));
    }

    /**
     * Notify the requester once retries are exhausted.
     */
    public function failed(?Throwable $exception): void
    {
        report($exception);

        User::query()->find($this->userId)?->notify(new FilesTrashEmptyFailedNotification(
            jobId: $this->jobUuid,
            message: $exception?->getMessage() ?? 'Emptying the trash failed.',
        ));
    }
}
