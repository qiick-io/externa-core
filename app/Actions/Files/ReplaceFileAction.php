<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * Replace a file's binary content with a compatible upload.
 *
 * A replacement keeps the file's identity (id, URLs, references), so it must be the
 * same kind of file: the same extension, or the same mime family when the stored file
 * has no extension. Folder targets are rejected earlier by the ReplaceFileRequest.
 */
final class ReplaceFileAction
{
    public function __construct(
        private FileService $fileService,
    ) {}

    /**
     * @throws ValidationException When the upload's extension or mime family differs from the stored file
     */
    public function execute(File $file, UploadedFile $upload): File
    {
        $this->assertCompatibleReplaceUpload($file, $upload);

        return $this->fileService->replaceFile($file, $upload);
    }

    /**
     * Ensure a replacement upload matches the stored file extension or mime family.
     *
     * ponytail: when no stored/name extension exists, fall back to mime family (image/*, text/*, …).
     *
     * @throws ValidationException
     */
    private function assertCompatibleReplaceUpload(File $file, UploadedFile $upload): void
    {
        $expectedExtension = $this->normalizeExtension(
            $file->extension ?: pathinfo($file->name, PATHINFO_EXTENSION),
        );
        $uploadedExtension = $this->normalizeExtension(
            pathinfo($upload->getClientOriginalName(), PATHINFO_EXTENSION),
        );

        if ($expectedExtension !== null) {
            if ($uploadedExtension !== $expectedExtension) {
                throw ValidationException::withMessages([
                    'file' => [__('Replacement must use the .:extension extension.', ['extension' => $expectedExtension])],
                ]);
            }

            return;
        }

        $expectedMime = $file->mime_type;
        $uploadedMime = $upload->getMimeType();

        if ($expectedMime === null || $expectedMime === '' || $uploadedMime === null || $uploadedMime === '') {
            return;
        }

        $expectedFamily = strtolower(explode('/', $expectedMime, 2)[0]);
        $uploadedFamily = strtolower(explode('/', $uploadedMime, 2)[0]);

        if ($expectedFamily !== '' && $expectedFamily !== $uploadedFamily) {
            throw ValidationException::withMessages([
                'file' => [__('Replacement must be a :family file.', ['family' => $expectedFamily])],
            ]);
        }
    }

    /**
     * Normalize a file extension for comparison, returning null when empty.
     */
    private function normalizeExtension(?string $extension): ?string
    {
        $normalized = strtolower(ltrim(trim((string) $extension), '.'));

        return $normalized === '' ? null : $normalized;
    }
}
