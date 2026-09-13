<?php

namespace App\Jobs;

use App\Models\File;
use App\Models\User;
use App\Notifications\FileDuplicationCompletedNotification;
use App\Notifications\FileDuplicationFailedNotification;
use App\Services\FileService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Queued job that copies one or more files and notifies the requesting user.
 */
class DuplicateFilesJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  list<int>  $fileIds
     */
    public function __construct(
        public readonly int $userId,
        public readonly array $fileIds,
        public readonly ?int $targetParentId,
        public readonly string $jobUuid,
    ) {}

    /**
     * Copy files and notify the user on success or failure.
     */
    public function handle(FileService $fileService): void
    {
        $user = User::query()->find($this->userId);

        if ($user === null) {
            return;
        }

        try {
            $copiedFiles = count($this->fileIds) === 1
                ? [$fileService->copy(
                    File::query()->findOrFail($this->fileIds[0]),
                    $this->targetParentId,
                )]
                : $fileService->bulkCopy($this->fileIds, $this->targetParentId);

            $firstCopy = $copiedFiles[0] ?? null;
            $folderId = null;

            if ($firstCopy !== null) {
                $folderId = $firstCopy->isFolder()
                    ? $firstCopy->id
                    : $firstCopy->parent_id;
            }

            $user->notify(new FileDuplicationCompletedNotification(
                jobId: $this->jobUuid,
                count: count($copiedFiles),
                firstFileId: $firstCopy?->id,
                firstFilePath: $firstCopy?->path,
                folderId: $folderId,
            ));
        } catch (Throwable $exception) {
            report($exception);

            $user->notify(new FileDuplicationFailedNotification(
                jobId: $this->jobUuid,
                message: $exception->getMessage(),
            ));

            throw $exception;
        }
    }
}
