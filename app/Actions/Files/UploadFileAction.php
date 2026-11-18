<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Models\File;
use App\Services\FileService;
use App\Services\Settings\Project\ProjectFilesSettingsService;
use App\Services\Uploads\UploadSizeLimiterService;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * Store one single-request upload in the file manager.
 *
 * The project's upload cap and PHP's own single-upload limit are checked here, before
 * {@see FileService::uploadFile()} sniffs, hashes and writes the file to the disk.
 */
final class UploadFileAction
{
    public function __construct(
        private FileService $fileService,
        private ProjectFilesSettingsService $filesSettings,
    ) {}

    /**
     * @throws ValidationException When the file is over the project cap or PHP's single-upload limit
     */
    public function execute(UploadedFile $uploadedFile, ?int $parentId, string $disk, ?string $name): File
    {
        $size = (int) $uploadedFile->getSize();
        UploadSizeLimiterService::assertWithinCap($this->filesSettings->filesMaxUploadBytes(), $size);
        UploadSizeLimiterService::assertFitsPhpSingleUpload($size);

        return $this->fileService->uploadFile($uploadedFile, $parentId, $disk, $name);
    }
}
