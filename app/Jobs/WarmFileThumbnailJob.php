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

    public function __construct(
        public readonly int $fileId,
    ) {}

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
        } catch (Throwable) {
            // Best-effort warm-up; request path can generate on demand.
        }
    }
}
