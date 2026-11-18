<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileVersion;
use App\Services\FileTransformService;

/**
 * Keeps local file bytes on the disk that matches effective privacy (assets ↔ private_assets).
 */
class FilePrivacyDiskService
{
    public function __construct(
        private readonly FileStorageService $storage,
    ) {}

    /**
     * Move effective-private local assets onto private_assets (and back when public).
     *
     * @return int Number of files whose disk changed
     */
    public function migratePrivateFilesToPrivateDisk(): int
    {
        $moved = 0;

        File::query()
            ->where('type', FileTypeEnum::File)
            ->whereIn('disk', ['assets', FilesDiskService::PRIVATE_ASSETS])
            ->whereNotNull('storage_path')
            ->orderBy('id')
            ->chunkById(100, function ($files) use (&$moved): void {
                foreach ($files as $file) {
                    $before = $file->disk;
                    $reconciled = $this->reconcilePrivacyDisk($file);
                    if ($reconciled->disk !== $before) {
                        $moved++;
                    }
                }
            });

        return $moved;
    }

    /**
     * Ensure a file's local disk matches effective privacy (assets ↔ private_assets).
     *
     * Side effects: clears cached transforms, moves the bytes and repoints the current version row.
     */
    public function reconcilePrivacyDisk(File $file): File
    {
        if (! $file->isFile() || ! $file->storage_path) {
            return $file;
        }

        if (! FilesDiskService::isLocalAssetsFamily($file->disk)) {
            return $file;
        }

        $targetDisk = FilesDiskService::forEffectivePrivacy($file->isEffectivelyPrivate(), $file->disk);
        if ($targetDisk === $file->disk) {
            return $file;
        }

        app(FileTransformService::class)->clearTransforms($file);

        $newPath = $this->storage->generateStoragePath($file->name, $targetDisk);
        $this->storage->movePhysicalFileBetweenDisks(
            $file,
            $file->disk,
            $targetDisk,
            $file->storage_path,
            $newPath,
        );

        $file->disk = $targetDisk;
        $file->storage_path = $newPath;
        $file->save();

        if ($file->current_version_id) {
            FileVersion::query()
                ->where('id', $file->current_version_id)
                ->update([
                    'disk' => $targetDisk,
                    'storage_path' => $newPath,
                ]);
        }

        return $file->fresh(['tags']);
    }

    /**
     * Reconcile local disks for every file under a folder after visibility changes.
     */
    public function reconcileDescendantPrivacyDisks(File $folder): void
    {
        if (! $folder->isFolder()) {
            return;
        }

        File::query()
            ->where('type', FileTypeEnum::File)
            ->where('path', 'like', $folder->path.'/%')
            ->whereIn('disk', ['assets', FilesDiskService::PRIVATE_ASSETS])
            ->whereNotNull('storage_path')
            ->orderBy('id')
            ->chunkById(100, function ($files): void {
                foreach ($files as $file) {
                    $this->reconcilePrivacyDisk($file);
                }
            });
    }
}
