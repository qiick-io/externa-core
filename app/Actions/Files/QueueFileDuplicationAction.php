<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Jobs\DuplicateFilesJob;
use Illuminate\Support\Str;

/**
 * Queue a background duplication of one or more files or folders.
 *
 * Side effect: dispatches {@see DuplicateFilesJob}, which notifies the requester when done.
 */
final class QueueFileDuplicationAction
{
    /**
     * @param  list<int|string>  $fileIds
     * @return string The job id the client polls or matches against the notification
     */
    public function execute(int $userId, array $fileIds, ?int $targetParentId): string
    {
        $jobUuid = (string) Str::uuid();

        DuplicateFilesJob::dispatch(
            $userId,
            array_values(array_map(static fn (mixed $fileId): int => (int) $fileId, $fileIds)),
            $targetParentId,
            $jobUuid,
        );

        return $jobUuid;
    }
}
