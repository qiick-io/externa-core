<?php

namespace App\Jobs;

use App\Models\File;
use App\Services\FileTransformService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Pre-generate the default thumbnail for a newly uploaded/replaced raster image.
 */
class WarmFileThumbnailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 60;

    public function __construct(
        public readonly int $fileId,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30];
    }

    public function handle(FileTransformService $fileTransformService): void
    {
        $file = File::query()->find($this->fileId);
        if ($file === null || ! $fileTransformService->isImage($file)) {
            return;
        }

        if (! $fileTransformService->transformationsEnabled()) {
            return;
        }

        try {
            $fileTransformService->ensureThumbnail($file);
        } catch (Throwable $exception) {
            // Best-effort warm-up; request path can generate on demand.
            report($exception);
        }
    }

    public function failed(?Throwable $exception): void
    {
        report($exception);
    }
}
