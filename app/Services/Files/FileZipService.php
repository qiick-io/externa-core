<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * Zip downloads of file-manager selections: where async zips live, how they are built under the
 * size cap, and their expiry cleanup.
 */
class FileZipService
{
    /**
     * Absolute path where a user's async zip job should be written.
     */
    public function zipStoragePath(int $userId, string $jobId): string
    {
        return storage_path('app/zips/'.$userId.'/'.$jobId.'.zip');
    }

    /**
     * Build a zip of the given files/folders. Returns absolute path.
     *
     * @param  list<int>  $fileIds
     *
     * @throws \RuntimeException When the archive cannot be created or exceeds max size
     */
    public function buildZipArchive(array $fileIds, ?string $destinationPath = null, ?int $maxBytes = null): string
    {
        $files = File::query()->whereIn('id', $fileIds)->get();
        $zipPath = $destinationPath ?? storage_path('app/tmp/files-'.Str::uuid().'.zip');
        $maxBytes ??= (int) config('files.zip_max_bytes', 104_857_600);

        if (! is_dir(dirname($zipPath))) {
            mkdir(dirname($zipPath), 0755, true);
        }

        $zip = new ZipArchive;
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Unable to create zip archive.');
        }

        $totalBytes = 0;

        foreach ($files as $file) {
            $totalBytes = $this->addFileToZip($zip, $file, $file->name, $totalBytes, $maxBytes);
        }

        $zip->close();

        return $zipPath;
    }

    /**
     * Delete zip files older than the configured TTL. Returns count removed.
     */
    public function cleanupExpiredZips(): int
    {
        $ttlMinutes = (int) config('files.zip_ttl_minutes', 60);
        $cutoff = now()->subMinutes($ttlMinutes)->getTimestamp();
        $root = storage_path('app/zips');

        if (! is_dir($root)) {
            return 0;
        }

        $cleanedCount = 0;

        foreach (glob($root.'/*/*.zip') ?: [] as $zipPath) {
            $modifiedAt = @filemtime($zipPath);

            if ($modifiedAt === false || $modifiedAt > $cutoff) {
                continue;
            }

            if (@unlink($zipPath)) {
                $cleanedCount++;
            }
        }

        return $cleanedCount;
    }

    /**
     * Add a file (or a folder recursively) and return the running byte total.
     *
     * @throws \RuntimeException When the running total would exceed `$maxBytes`
     */
    private function addFileToZip(ZipArchive $zip, File $file, string $entryName, int $totalBytes, int $maxBytes): int
    {
        if ($file->isFolder()) {
            $zip->addEmptyDir($entryName);

            foreach ($file->children as $child) {
                $totalBytes = $this->addFileToZip(
                    $zip,
                    $child,
                    $entryName.'/'.$child->name,
                    $totalBytes,
                    $maxBytes,
                );
            }

            return $totalBytes;
        }

        if (! $file->storage_path || ! Storage::disk($file->disk)->exists($file->storage_path)) {
            return $totalBytes;
        }

        $size = (int) ($file->size ?? 0);
        if ($totalBytes + $size > $maxBytes) {
            throw new \RuntimeException('Zip exceeds the maximum allowed size.');
        }

        $contents = Storage::disk($file->disk)->get($file->storage_path);
        if ($contents === false) {
            return $totalBytes;
        }

        $zip->addFromString($entryName, $contents);

        return $totalBytes + strlen($contents);
    }
}
