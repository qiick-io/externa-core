<?php

declare(strict_types=1);

namespace App\Actions\Files;

use App\Ai\Support\SafeRemoteFetcher;
use App\Ai\Support\SafeRemoteUrlValidator;
use App\Models\File;
use App\Services\Files\FilesDiskService;
use App\Services\FileService;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * Download a remote URL (SSRF-safe) and store it as a file manager asset.
 */
final class ImportFileFromUrlAction
{
    public function __construct(
        private FileService $fileService,
    ) {}

    /**
     * Fetch the URL, name the file after the URL path (or `$name`), add an extension from
     * the content type when the name has none, and upload it to the default files disk.
     *
     * Side effects: one outbound HTTP request and a temporary file, removed afterwards.
     *
     * @throws ValidationException On an unsafe URL, a failed or empty download, or a body over 25 MB
     */
    public function execute(string $url, ?string $name, ?int $parentId): File
    {
        $url = trim($url);

        if ($ssrfError = SafeRemoteUrlValidator::validate($url)) {
            throw ValidationException::withMessages([
                'url' => [preg_replace('/^Error:\s*/', '', $ssrfError) ?: $ssrfError],
            ]);
        }

        $maxBytes = 25 * 1024 * 1024;

        try {
            $fetched = SafeRemoteFetcher::get(
                $url,
                $maxBytes,
                headers: ['Accept' => '*/*'],
                timeoutSeconds: 30,
            );
        } catch (\Throwable $exception) {
            throw ValidationException::withMessages([
                'url' => [__('Failed to download URL.')],
            ]);
        }

        if ($fetched['status'] >= 400) {
            throw ValidationException::withMessages([
                'url' => [__('Remote download failed.')],
            ]);
        }

        $body = $fetched['body'];

        if ($body === '' || strlen($body) > $maxBytes) {
            throw ValidationException::withMessages([
                'url' => [$body === '' ? __('Remote file is empty.') : __('Remote file is too large (max 25 MB).')],
            ]);
        }

        $mime = $fetched['content_type'] ?: 'application/octet-stream';
        $mime = strtolower(trim(explode(';', $mime)[0]));

        $pathName = parse_url($url, PHP_URL_PATH);
        $basename = is_string($pathName) ? basename($pathName) : '';
        $basename = $basename !== '' && $basename !== '/' ? $basename : 'download';
        $fileName = $name ?? $basename;

        if (! pathinfo($fileName, PATHINFO_EXTENSION)) {
            $ext = match (true) {
                str_starts_with($mime, 'image/jpeg') => 'jpg',
                str_starts_with($mime, 'image/png') => 'png',
                str_starts_with($mime, 'image/gif') => 'gif',
                str_starts_with($mime, 'image/webp') => 'webp',
                str_starts_with($mime, 'image/svg') => 'svg',
                str_contains($mime, 'pdf') => 'pdf',
                default => null,
            };

            if ($ext !== null) {
                $fileName .= '.'.$ext;
            }
        }

        $tmpPath = tempnam(sys_get_temp_dir(), 'externa-import-');

        if ($tmpPath === false) {
            throw ValidationException::withMessages([
                'url' => [__('Could not create a temporary file.')],
            ]);
        }

        try {
            file_put_contents($tmpPath, $body);

            $uploaded = new UploadedFile(
                $tmpPath,
                $fileName,
                $mime,
                null,
                true,
            );

            $file = $this->fileService->uploadFile(
                $uploaded,
                $parentId,
                FilesDiskService::default(),
                $fileName,
            );
        } finally {
            if (is_file($tmpPath)) {
                @unlink($tmpPath);
            }
        }

        return $file;
    }
}
