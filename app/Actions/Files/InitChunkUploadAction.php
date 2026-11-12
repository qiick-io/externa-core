<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Models\FileUpload;
use App\Services\FileService;
use App\Services\Settings\ProjectSettingsService;
use App\Support\Uploads\UploadSizeLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Open a resumable chunked upload session once the announced size fits the project cap.
 */
final class InitChunkUploadAction
{
    public function __construct(
        private FileService $fileService,
        private ProjectSettingsService $projectSettings,
    ) {}

    /**
     * @throws ValidationException When `total_size` is over the project upload cap
     */
    public function execute(
        string $fileName,
        int $totalSize,
        int $totalChunks,
        ?string $mimeType,
        ?int $parentId,
        string $disk,
    ): FileUpload {
        UploadSizeLimiter::assertWithinCap(
            $this->projectSettings->filesMaxUploadBytes(),
            $totalSize,
            'total_size',
        );

        return $this->fileService->initChunkUpload($fileName, $totalSize, $totalChunks, $mimeType, $parentId, $disk);
    }
}
