<?php

namespace App\Jobs;

use App\Models\User;
use App\Notifications\FileZipFailed;
use App\Notifications\FileZipReady;
use App\Services\FileService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Throwable;

class PrepareFilesZipJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  list<int>  $fileIds
     */
    public function __construct(
        public readonly int $userId,
        public readonly array $fileIds,
        public readonly string $jobUuid,
    ) {}

    public function handle(FileService $fileService): void
    {
        $user = User::query()->find($this->userId);

        if ($user === null) {
            return;
        }

        try {
            $zipPath = $fileService->buildZipArchive(
                $this->fileIds,
                $fileService->zipStoragePath($this->userId, $this->jobUuid),
            );

            $ttlMinutes = (int) config('files.zip_ttl_minutes', 60);
            $expiresAt = Carbon::now()->addMinutes($ttlMinutes);

            $user->notify(new FileZipReady(
                jobId: $this->jobUuid,
                downloadUrl: route('files.zips.download', $this->jobUuid),
                expiresAt: $expiresAt->toIso8601String(),
                fileCount: count($this->fileIds),
                zipBytes: is_file($zipPath) ? (int) filesize($zipPath) : null,
            ));
        } catch (Throwable $exception) {
            report($exception);

            $user->notify(new FileZipFailed(
                jobId: $this->jobUuid,
                message: $exception->getMessage(),
            ));

            throw $exception;
        }
    }
}
