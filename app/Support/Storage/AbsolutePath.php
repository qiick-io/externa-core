<?php

namespace App\Support\Storage;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Resolve a readable local path for a storage object (local disk or temp materialization).
 */
final class AbsolutePath
{
    /**
     * For local disks return the real path. For remote disks copy into a temp file.
     *
     * Callers that need a filesystem path (ZipArchive, UploadedFile, parsers) must use this
     * instead of Storage::path() when the disk may be S3/MinIO.
     */
    public static function resolve(string $disk, string $path): string
    {
        $storage = Storage::disk($disk);

        if (! $storage->exists($path)) {
            throw new RuntimeException("Storage object [{$disk}:{$path}] does not exist.");
        }

        if (Config::get("filesystems.disks.{$disk}.driver", '') === 'local') {
            return $storage->path($path);
        }

        $contents = $storage->get($path);
        if ($contents === false || $contents === null) {
            throw new RuntimeException("Unable to read storage object [{$disk}:{$path}].");
        }

        $extension = pathinfo($path, PATHINFO_EXTENSION);
        $tmp = tempnam(sys_get_temp_dir(), 'externa-');
        if ($tmp === false) {
            throw new RuntimeException('Unable to create temporary file.');
        }

        if ($extension !== '') {
            $named = $tmp.'.'.$extension;
            if (! @rename($tmp, $named)) {
                @unlink($tmp);
                throw new RuntimeException('Unable to prepare temporary file.');
            }
            $tmp = $named;
        }

        if (file_put_contents($tmp, $contents) === false) {
            @unlink($tmp);
            throw new RuntimeException('Unable to write temporary file.');
        }

        return $tmp;
    }
}
