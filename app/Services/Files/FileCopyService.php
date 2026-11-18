<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileVersion;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Duplicates file-manager nodes: files get their own bytes and version row, folders are deep-copied,
 * and every copy gets a unique "<name> copy[ N]" name under its target parent.
 */
class FileCopyService
{
    public function __construct(
        private readonly FileStorageService $storage,
        private readonly FileTreeService $tree,
    ) {}

    /**
     * Deep-copy a file or folder tree under an optional new parent.
     *
     * Side effect: copies the stored bytes of every file in the tree.
     */
    public function copy(File $file, ?int $targetParentId = null): File
    {
        return DB::transaction(function () use ($file, $targetParentId) {
            if ($file->isFolder()) {
                return $this->copyFolder($file, $targetParentId ?? $file->parent_id);
            }

            return $this->copyFileRecord($file, $targetParentId ?? $file->parent_id);
        });
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkCopy(array $fileIds, ?int $targetParentId = null): array
    {
        $copied = [];

        foreach (File::query()->whereIn('id', $fileIds)->get() as $file) {
            $copied[] = $this->copy($file, $targetParentId);
        }

        return $copied;
    }

    private function copyFileRecord(File $file, ?int $targetParentId): File
    {
        $copyName = $this->uniqueCopyName($file->name, $targetParentId);
        $newStoragePath = null;

        if ($file->storage_path && Storage::disk($file->disk)->exists($file->storage_path)) {
            $newStoragePath = $this->storage->generateStoragePath($copyName, $file->disk);
            Storage::disk($file->disk)->copy($file->storage_path, $newStoragePath);
        }

        $copy = File::query()->create([
            'parent_id' => $targetParentId,
            'type' => FileTypeEnum::File,
            'name' => $copyName,
            'title' => $file->title,
            'description' => $file->description,
            'location' => $file->location,
            'download_name' => $file->download_name,
            'path' => '/'.$copyName,
            'disk' => $file->disk,
            'storage_path' => $newStoragePath,
            'mime_type' => $file->mime_type,
            'extension' => $file->extension,
            'size' => $file->size,
            'width' => $file->width,
            'height' => $file->height,
            'meta' => $file->meta,
            'hash' => $file->hash,
            'focal_point_x' => $file->focal_point_x,
            'focal_point_y' => $file->focal_point_y,
            'translate_x' => $file->translate_x,
            'translate_y' => $file->translate_y,
            'scale' => $file->scale,
        ]);

        if ($newStoragePath !== null) {
            $version = FileVersion::query()->create([
                'file_id' => $copy->id,
                'disk' => $copy->disk,
                'storage_path' => $newStoragePath,
                'hash' => $copy->hash,
                'mime_type' => $copy->mime_type,
                'size' => $copy->size ?? 0,
                'width' => $copy->width,
                'height' => $copy->height,
                'meta' => $copy->meta,
            ]);
            $copy->current_version_id = $version->id;
        }

        $copy->path = $this->tree->calculatePath($copy);
        $copy->save();

        $tagNames = $file->tags->map(fn ($tag) => $tag->name)->all();
        if ($tagNames !== []) {
            $copy->syncTags($tagNames);
        }

        return $copy->fresh(['tags']);
    }

    private function copyFolder(File $folder, ?int $targetParentId): File
    {
        $copyName = $this->uniqueCopyName($folder->name, $targetParentId);

        $copy = File::query()->create([
            'parent_id' => $targetParentId,
            'type' => FileTypeEnum::Folder,
            'name' => $copyName,
            'title' => $folder->title,
            'description' => $folder->description,
            'location' => $folder->location,
            'path' => '/'.$copyName,
            'disk' => $folder->disk,
        ]);

        $copy->path = $this->tree->calculatePath($copy);
        $copy->save();

        foreach ($folder->children as $child) {
            $this->copy($child, $copy->id);
        }

        return $copy->fresh(['tags']);
    }

    private function uniqueCopyName(string $name, ?int $parentId): string
    {
        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $basename = pathinfo($name, PATHINFO_FILENAME);
        $candidate = $basename.' copy'.($extension !== '' ? '.'.$extension : '');
        $counter = 2;

        while (
            File::query()
                ->where('parent_id', $parentId)
                ->where('name', $candidate)
                ->exists()
        ) {
            $candidate = $basename.' copy '.$counter.($extension !== '' ? '.'.$extension : '');
            $counter++;
        }

        return $candidate;
    }
}
