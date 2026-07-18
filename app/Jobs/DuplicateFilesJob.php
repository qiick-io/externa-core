<?php

namespace App\Jobs;

use App\Models\File;
use App\Models\User;
use App\Notifications\FileDuplicationCompleted;
use App\Notifications\FileDuplicationFailed;
use App\Services\FileService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

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

            $user->notify(new FileDuplicationCompleted(
                jobId: $this->jobUuid,
                count: count($copiedFiles),
                firstFileId: $firstCopy?->id,
                firstFilePath: $firstCopy?->path,
                folderId: $folderId,
            ));
        } catch (Throwable $exception) {
            report($exception);

            $user->notify(new FileDuplicationFailed(
                jobId: $this->jobUuid,
                message: $exception->getMessage(),
            ));

            throw $exception;
        }
    }
}
