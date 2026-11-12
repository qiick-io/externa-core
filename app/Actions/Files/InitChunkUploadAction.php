<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Models\FileUpload;
use App\Services\FileChunkUploadService;
use App\Services\Settings\Project\ProjectFilesSettingsService;
use App\Services\Uploads\UploadSizeLimiterService;
use Illuminate\Validation\ValidationException;

/**
 * Open a resumable chunked upload session once the announced size fits the project cap.
 */
final class InitChunkUploadAction
{
    public function __construct(
        private FileChunkUploadService $chunkUploads,
        private ProjectFilesSettingsService $filesSettings,
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
        UploadSizeLimiterService::assertWithinCap(
            $this->filesSettings->filesMaxUploadBytes(),
            $totalSize,
            'total_size',
        );

        return $this->chunkUploads->initChunkUpload($fileName, $totalSize, $totalChunks, $mimeType, $parentId, $disk);
    }
}
