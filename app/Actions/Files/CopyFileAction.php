<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Models\File;
use App\Services\FileService;

/**
 * Copy one file synchronously when it is small, otherwise queue the duplication.
 *
 * Folders always go to the queue: their size is the sum of a subtree, unknown up front.
 * The synchronous ceiling is `files.duplicate_sync_max_bytes` (50 MB by default).
 */
final class CopyFileAction
{
    public function __construct(
        private FileService $fileService,
        private QueueFileDuplicationAction $queueFileDuplication,
    ) {}

    /**
     * @return File|string The copy, or the queued job id when the copy runs in the background
     */
    public function execute(File $file, ?int $targetParentId, int $userId): File|string
    {
        if ($this->shouldDuplicateSynchronously($file)) {
            return $this->fileService->copy($file, $targetParentId);
        }

        return $this->queueFileDuplication->execute($userId, [$file->id], $targetParentId);
    }

    /**
     * Decide whether a single non-folder file should duplicate synchronously.
     */
    private function shouldDuplicateSynchronously(File $file): bool
    {
        if ($file->isFolder()) {
            return false;
        }

        $maxBytes = (int) config('files.duplicate_sync_max_bytes', 52_428_800);

        return ($file->size ?? 0) <= $maxBytes;
    }
}
