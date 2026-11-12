<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;
use Illuminate\Support\Facades\Storage;

/**
 * Physical bytes of file-manager files: unique storage paths and moves between disks.
 */
class FileStorageService
{
    /**
     * Unique `Y/m/<basename>_<uniqid>.<ext>` path for new bytes on a disk.
     */
    public function generateStoragePath(string $fileName, string $disk): string
    {
        $extension = pathinfo($fileName, PATHINFO_EXTENSION);
        $basename = pathinfo($fileName, PATHINFO_FILENAME);
        $uniqueName = $basename.'_'.uniqid().($extension ? '.'.$extension : '');

        return date('Y/m').'/'.$uniqueName;
    }

    /**
     * Copy the bytes to the new disk and path, then delete the old copy (skipped when unreadable).
     */
    public function movePhysicalFileBetweenDisks(File $file, string $oldDisk, string $newDisk, string $oldPath, string $newPath): void
    {
        $oldStorage = Storage::disk($oldDisk);
        $newStorage = Storage::disk($newDisk);

        $contents = $oldStorage->get($oldPath);
        if ($contents !== false) {
            $newStorage->put($newPath, $contents);
            $oldStorage->delete($oldPath);
        }
    }
}
