<?php

namespace App\Services;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\FileVersion;
use App\Models\User;
use App\Traits\HasFiles;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * Orchestrates file and folder CRUD, bulk operations, chunked uploads, zips, and attachments.
 */
class FileService
{
    /**
     * Create a folder node and persist its computed path.
     */
    public function createFolder(string $name, ?int $parentId = null, string $disk = 'assets'): File
    {
        return DB::transaction(function () use ($name, $parentId, $disk) {
            $file = File::query()->create([
                'parent_id' => $parentId,
                'type' => FileTypeEnum::Folder,
                'name' => $name,
                'path' => '/'.$name,
                'disk' => $disk,
                'storage_path' => null,
            ]);

            $file->path = $this->calculatePath($file);
            $file->save();

            return $file;
        });
    }

    /**
     * Store an uploaded file, deduplicate by hash when possible, and link a version row.
     */
    public function uploadFile(UploadedFile $uploadedFile, ?int $parentId = null, string $disk = 'assets', ?string $name = null): File
    {
        $fileName = $name ?? $uploadedFile->getClientOriginalName();
        $mimeType = $uploadedFile->getMimeType();
        $size = $uploadedFile->getSize() ?: 0;
        $storagePath = $this->generateStoragePath($fileName, $disk);
        $storedPath = null;

        try {
            $storedPath = Storage::disk($disk)->putFileAs(
                dirname($storagePath),
                $uploadedFile,
                basename($storagePath)
            );

            [$width, $height, $meta] = $this->extractImageMeta($disk, $storedPath, $mimeType, $uploadedFile->getContent());
            $fileHash = hash('sha256', $uploadedFile->getContent());

            return DB::transaction(function () use ($parentId, $disk, $fileName, $mimeType, $size, $width, $height, $meta, $storedPath, $fileHash) {
                $version = $this->resolveOrCreateVersion($disk, $storedPath, $fileHash, $mimeType, $size, $width, $height, $meta);

                $file = File::query()->create([
                    'parent_id' => $parentId,
                    'name' => $fileName,
                    'type' => FileTypeEnum::File,
                    'path' => '/'.$fileName,
                    'disk' => $version->disk,
                    'storage_path' => $version->storage_path,
                    'mime_type' => $mimeType,
                    'extension' => pathinfo($fileName, PATHINFO_EXTENSION) ?: null,
                    'size' => $size,
                    'width' => $width,
                    'height' => $height,
                    'meta' => $meta,
                    'hash' => $fileHash,
                ]);

                $version->file_id = $file->id;
                $version->save();

                $file->current_version_id = $version->id;
                $file->path = $this->calculatePath($file);
                $file->save();

                return $file;
            });
        } catch (\Throwable $e) {
            if ($storedPath !== null) {
                Storage::disk($disk)->delete($storedPath);
            }

            throw $e;
        }
    }

    /**
     * Move a file or folder, optionally across disks, with optimistic locking when version is supplied.
     *
     * @throws HttpResponseException When optimistic lock fails (409)
     */
    public function move(File $file, ?int $targetParentId, ?string $targetDisk = null, ?Carbon $version = null): File
    {
        if ($targetParentId !== null) {
            $this->validateNotDescendant($file, $targetParentId);
        }

        $oldDisk = $file->disk;
        $newDisk = $targetDisk ?? $oldDisk;
        $oldStoragePath = $file->storage_path;
        $newStoragePath = null;
        $fileMoved = false;

        try {
            if ($oldDisk !== $newDisk && $file->isFile() && $file->storage_path) {
                $newStoragePath = $this->generateStoragePath($file->name, $newDisk);
                $this->movePhysicalFileBetweenDisks($file, $oldDisk, $newDisk, $oldStoragePath, $newStoragePath);
                $fileMoved = true;
            }

            return DB::transaction(function () use ($file, $targetParentId, $newDisk, $newStoragePath, $fileMoved, $version) {
                if ($version !== null) {
                    $updated = File::query()
                        ->where('id', $file->id)
                        ->where('updated_at', $version)
                        ->update([
                            'parent_id' => $targetParentId,
                            'disk' => $newDisk,
                            'storage_path' => $fileMoved ? $newStoragePath : $file->storage_path,
                            'updated_at' => now(),
                        ]);

                    if ($updated === 0) {
                        throw new HttpResponseException(
                            response()->json(['message' => 'File has been modified by another operation. Please refresh and try again.'], 409)
                        );
                    }

                    $file = $file->fresh();
                } else {
                    $file->parent_id = $targetParentId;
                    $file->disk = $newDisk;
                    if ($fileMoved) {
                        $file->storage_path = $newStoragePath;
                    }
                    $file->save();
                }

                $file->path = $this->calculatePath($file);
                $file->save();

                if ($file->isFolder()) {
                    $this->updateChildrenPaths($file);
                }

                return $file->fresh();
            });
        } catch (\Throwable $e) {
            if ($fileMoved && $oldStoragePath && $newStoragePath) {
                $oldStorage = Storage::disk($oldDisk);
                $newStorage = Storage::disk($newDisk);

                if ($newStorage->exists($newStoragePath)) {
                    $contents = $newStorage->get($newStoragePath);
                    if ($contents !== false) {
                        $oldStorage->put($oldStoragePath, $contents);
                        $newStorage->delete($newStoragePath);
                    }
                }
            }

            throw $e;
        }
    }

    /**
     * Rename a file or folder and recalculate descendant paths when needed.
     */
    public function rename(File $file, string $newName): File
    {
        return DB::transaction(function () use ($file, $newName) {
            $file->name = $newName;
            $file->path = $this->calculatePath($file);
            $file->save();

            if ($file->isFolder()) {
                $this->updateChildrenPaths($file);
            }

            return $file->fresh();
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function updateMetadata(File $file, array $attributes): File
    {
        return DB::transaction(function () use ($file, $attributes) {
            $allowed = [
                'title',
                'description',
                'location',
                'download_name',
                'focal_point_x',
                'focal_point_y',
                'translate_x',
                'translate_y',
                'scale',
            ];

            foreach ($allowed as $key) {
                if (array_key_exists($key, $attributes)) {
                    $file->{$key} = $attributes[$key];
                }
            }

            $file->save();

            return $file->fresh(['tags']);
        });
    }

    /**
     * @param  list<string>  $tagNames
     */
    public function syncTags(File $file, array $tagNames): File
    {
        $file->syncTags($this->normalizeTagNames($tagNames));

        return $file->fresh(['tags']);
    }

    /**
     * Replace file bytes in storage and register a new version row.
     *
     * @throws \InvalidArgumentException When the target is not a file
     */
    public function replaceFile(File $file, UploadedFile $uploadedFile): File
    {
        if (! $file->isFile()) {
            throw new \InvalidArgumentException('Only files can be replaced.');
        }

        app(FileTransformService::class)->clearTransforms($file);

        $mimeType = $uploadedFile->getMimeType();
        $size = $uploadedFile->getSize() ?: 0;
        $storagePath = $this->generateStoragePath($file->name, $file->disk);
        $storedPath = null;

        try {
            $storedPath = Storage::disk($file->disk)->putFileAs(
                dirname($storagePath),
                $uploadedFile,
                basename($storagePath)
            );

            [$width, $height, $meta] = $this->extractImageMeta($file->disk, $storedPath, $mimeType, $uploadedFile->getContent());
            $fileHash = hash('sha256', $uploadedFile->getContent());

            return DB::transaction(function () use ($file, $storedPath, $fileHash, $mimeType, $size, $width, $height, $meta) {
                $version = $this->resolveOrCreateVersion(
                    $file->disk,
                    $storedPath,
                    $fileHash,
                    $mimeType,
                    $size,
                    $width,
                    $height,
                    $meta,
                );

                $version->file_id = $file->id;
                $version->save();

                $file->storage_path = $version->storage_path;
                $file->disk = $version->disk;
                $file->mime_type = $mimeType;
                $file->extension = pathinfo($file->name, PATHINFO_EXTENSION) ?: null;
                $file->size = $size;
                $file->width = $width;
                $file->height = $height;
                $file->meta = $meta;
                $file->hash = $fileHash;
                $file->current_version_id = $version->id;
                $file->save();

                return $file->fresh(['tags']);
            });
        } catch (\Throwable $exception) {
            if ($storedPath !== null) {
                Storage::disk($file->disk)->delete($storedPath);
            }

            throw $exception;
        }
    }

    /**
     * Deep-copy a file or folder tree under an optional new parent.
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
     * Mark a file as favorited for the given user.
     */
    public function favorite(File $file, User $user): void
    {
        $file->favoritedBy()->syncWithoutDetaching([$user->id]);
    }

    /**
     * Remove a user's favorite marker from a file.
     */
    public function unfavorite(File $file, User $user): void
    {
        $file->favoritedBy()->detach($user->id);
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkFavorite(array $fileIds, User $user, bool $favorite): array
    {
        $files = File::query()->whereIn('id', $fileIds)->get();

        foreach ($files as $file) {
            if ($favorite) {
                $this->favorite($file, $user);
            } else {
                $this->unfavorite($file, $user);
            }
        }

        return $files->all();
    }

    /**
     * @param  list<int>  $fileIds
     * @param  list<string>  $tagNames
     * @return list<File>
     */
    public function bulkTag(array $fileIds, array $tagNames, bool $attach): array
    {
        $normalizedTagNames = $this->normalizeTagNames($tagNames);
        $files = File::query()->whereIn('id', $fileIds)->get();

        foreach ($files as $file) {
            if ($attach) {
                $file->attachTags($normalizedTagNames);
            } else {
                $file->detachTags($normalizedTagNames);
            }
        }

        return $files->map(fn (File $file): File => $file->fresh(['tags']))->all();
    }

    /**
     * @param  list<string>  $tagNames
     * @return list<string>
     */
    protected function normalizeTagNames(array $tagNames): array
    {
        return array_values(array_unique(array_filter(
            array_map(
                static fn (mixed $tagName): string => trim((string) $tagName),
                $tagNames,
            ),
            static fn (string $tagName): bool => $tagName !== '',
        )));
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkMove(array $fileIds, ?int $targetParentId): array
    {
        $moved = [];

        foreach (File::query()->whereIn('id', $fileIds)->get() as $file) {
            $moved[] = $this->move($file, $targetParentId);
        }

        return $moved;
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

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkSoftDelete(array $fileIds): void
    {
        foreach (File::query()->whereIn('id', $fileIds)->get() as $file) {
            $this->softDelete($file);
        }
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkRestore(array $fileIds): void
    {
        foreach (File::query()->onlyTrashed()->whereIn('id', $fileIds)->get() as $file) {
            $this->restore($file);
        }
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkForceDelete(array $fileIds): void
    {
        foreach (File::query()->withTrashed()->whereIn('id', $fileIds)->get() as $file) {
            $this->forceDelete($file);
        }
    }

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

    protected function copyFileRecord(File $file, ?int $targetParentId): File
    {
        $copyName = $this->uniqueCopyName($file->name, $targetParentId);
        $newStoragePath = null;

        if ($file->storage_path && Storage::disk($file->disk)->exists($file->storage_path)) {
            $newStoragePath = $this->generateStoragePath($copyName, $file->disk);
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

        $copy->path = $this->calculatePath($copy);
        $copy->save();

        $tagNames = $file->tags->map(fn ($tag) => $tag->name)->all();
        if ($tagNames !== []) {
            $copy->syncTags($tagNames);
        }

        return $copy->fresh(['tags']);
    }

    protected function copyFolder(File $folder, ?int $targetParentId): File
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

        $copy->path = $this->calculatePath($copy);
        $copy->save();

        foreach ($folder->children as $child) {
            $this->copy($child, $copy->id);
        }

        return $copy->fresh(['tags']);
    }

    protected function uniqueCopyName(string $name, ?int $parentId): string
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

    protected function addFileToZip(ZipArchive $zip, File $file, string $entryName, int $totalBytes, int $maxBytes): int
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

    /**
     * Soft-delete a file or folder and all descendants recursively.
     */
    public function softDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach ($file->children as $child) {
                $this->softDelete($child);
            }

            $file->delete();
        });
    }

    /**
     * Restore a soft-deleted file or folder and its trashed descendants.
     */
    public function restore(File $file): File
    {
        return DB::transaction(function () use ($file) {
            $file->restore();

            foreach (File::query()->onlyTrashed()->where('parent_id', $file->id)->get() as $child) {
                $this->restore($child);
            }

            return $file->fresh();
        });
    }

    /**
     * Permanently delete a file or folder tree and remove storage bytes.
     */
    public function forceDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach (File::query()->withTrashed()->where('parent_id', $file->id)->get() as $child) {
                $this->forceDelete($child);
            }

            if ($file->isFile() && $file->storage_path) {
                app(FileTransformService::class)->clearTransforms($file);
                Storage::disk($file->disk)->delete($file->storage_path);
            }

            $file->forceDelete();
        });
    }

    /**
     * Attach a file to a model using the HasFiles trait.
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function attachToModel(File $file, string $modelType, int $modelId, ?string $role = null, int $order = 0): void
    {
        DB::transaction(function () use ($file, $modelType, $modelId, $role, $order) {
            if (! class_exists($modelType)) {
                throw new \InvalidArgumentException("Model class '{$modelType}' does not exist.");
            }

            $model = $modelType::query()->find($modelId);
            if (! $model) {
                throw new \InvalidArgumentException("Model '{$modelType}' with ID {$modelId} not found.");
            }

            if (! in_array(HasFiles::class, class_uses_recursive($modelType), true)) {
                throw new \InvalidArgumentException("Model '{$modelType}' does not use HasFiles trait.");
            }

            $model->attachFile($file, $role, $order);
        });
    }

    /**
     * Detach a file from a model, optionally scoped to a pivot role.
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function detachFromModel(File $file, string $modelType, int $modelId, ?string $role = null): void
    {
        DB::transaction(function () use ($file, $modelType, $modelId, $role) {
            if (! class_exists($modelType)) {
                throw new \InvalidArgumentException("Model class '{$modelType}' does not exist.");
            }

            $model = $modelType::query()->find($modelId);
            if (! $model) {
                throw new \InvalidArgumentException("Model '{$modelType}' with ID {$modelId} not found.");
            }

            if (! in_array(HasFiles::class, class_uses_recursive($modelType), true)) {
                throw new \InvalidArgumentException("Model '{$modelType}' does not use HasFiles trait.");
            }

            $model->detachFile($file, $role);
        });
    }

    /**
     * Begin a chunked upload session and return tracking metadata.
     */
    public function initChunkUpload(string $fileName, int $totalSize, int $totalChunks, ?string $mimeType = null, ?int $parentId = null, string $disk = 'assets'): FileUpload
    {
        $uploadId = bin2hex(random_bytes(32));
        $expiresAt = now()->addHours(24);

        return DB::transaction(function () use ($uploadId, $fileName, $totalSize, $totalChunks, $mimeType, $parentId, $disk, $expiresAt) {
            return FileUpload::query()->create([
                'upload_id' => $uploadId,
                'file_name' => $fileName,
                'mime_type' => $mimeType,
                'total_size' => $totalSize,
                'total_chunks' => $totalChunks,
                'uploaded_chunks' => 0,
                'disk' => $disk,
                'parent_id' => $parentId,
                'chunks_info' => [],
                'expires_at' => $expiresAt,
            ]);
        });
    }

    /**
     * Persist one chunk for an in-progress upload session.
     *
     * @throws \RuntimeException When the session expired or is already complete
     * @throws \InvalidArgumentException When chunk index is out of range
     */
    public function uploadChunk(string $uploadId, int $chunkIndex, UploadedFile $chunk): void
    {
        $fileUpload = FileUpload::query()->where('upload_id', $uploadId)->firstOrFail();

        if ($fileUpload->isExpired()) {
            throw new \RuntimeException('Upload session has expired.');
        }

        if ($fileUpload->isComplete()) {
            throw new \RuntimeException('All chunks have already been uploaded.');
        }

        if ($chunkIndex < 0 || $chunkIndex >= $fileUpload->total_chunks) {
            throw new \InvalidArgumentException("Invalid chunk index: {$chunkIndex}");
        }

        $storage = Storage::disk($fileUpload->disk);
        $chunkPath = $this->getChunkPath($uploadId, $chunkIndex);
        $storage->put($chunkPath, $chunk->getContent());

        DB::transaction(function () use ($fileUpload, $chunkIndex) {
            $chunksInfo = $fileUpload->chunks_info ?? [];
            $chunksInfo[$chunkIndex] = [
                'uploaded_at' => now()->toIso8601String(),
            ];

            $fileUpload->chunks_info = $chunksInfo;
            $fileUpload->uploaded_chunks = count($chunksInfo);
            $fileUpload->save();
        });
    }

    /**
     * Merge uploaded chunks into a final file record.
     *
     * @throws \RuntimeException When session expired, incomplete, or merge fails
     */
    public function completeChunkUpload(string $uploadId): File
    {
        $fileUpload = FileUpload::query()->where('upload_id', $uploadId)->firstOrFail();

        if ($fileUpload->isExpired()) {
            throw new \RuntimeException('Upload session has expired.');
        }

        if (! $fileUpload->isComplete()) {
            throw new \RuntimeException('Not all chunks have been uploaded.');
        }

        $storage = Storage::disk($fileUpload->disk);
        $tempFilePath = $this->getTempFilePath($uploadId);

        try {
            $finalFile = fopen('php://temp', 'r+');
            if ($finalFile === false) {
                throw new \RuntimeException('Failed to create temporary file handle.');
            }

            for ($i = 0; $i < $fileUpload->total_chunks; $i++) {
                $chunkPath = $this->getChunkPath($uploadId, $i);
                if (! $storage->exists($chunkPath)) {
                    throw new \RuntimeException("Chunk {$i} is missing.");
                }

                $chunkContent = $storage->get($chunkPath);
                if ($chunkContent === false) {
                    throw new \RuntimeException("Failed to read chunk {$i}.");
                }

                fwrite($finalFile, $chunkContent);
            }

            rewind($finalFile);
            $fileContent = stream_get_contents($finalFile);
            fclose($finalFile);

            if ($fileContent === false) {
                throw new \RuntimeException('Failed to read merged file content.');
            }

            $fileHash = hash('sha256', $fileContent);
            $storage->put($tempFilePath, $fileContent);

            [$width, $height, $meta] = $this->extractImageMeta(
                $fileUpload->disk,
                $tempFilePath,
                $fileUpload->mime_type,
                $fileContent
            );

            $version = $this->resolveOrCreateVersion(
                $fileUpload->disk,
                $tempFilePath,
                $fileHash,
                $fileUpload->mime_type,
                $fileUpload->total_size,
                $width,
                $height,
                $meta,
                moveFromTemp: true,
                fileName: $fileUpload->file_name
            );

            $file = DB::transaction(function () use ($fileUpload, $fileHash, $width, $height, $meta, $version) {
                $file = File::query()->create([
                    'parent_id' => $fileUpload->parent_id,
                    'name' => $fileUpload->file_name,
                    'type' => FileTypeEnum::File,
                    'path' => '/'.$fileUpload->file_name,
                    'disk' => $version->disk,
                    'storage_path' => $version->storage_path,
                    'mime_type' => $fileUpload->mime_type,
                    'extension' => pathinfo($fileUpload->file_name, PATHINFO_EXTENSION) ?: null,
                    'size' => $fileUpload->total_size,
                    'width' => $width,
                    'height' => $height,
                    'meta' => $meta,
                    'hash' => $fileHash,
                ]);

                $version->file_id = $file->id;
                $version->save();

                $file->current_version_id = $version->id;
                $file->path = $this->calculatePath($file);
                $file->save();

                return $file;
            });

            $this->cleanupChunks($uploadId, $fileUpload->disk);
            $fileUpload->delete();

            return $file;
        } catch (\Throwable $e) {
            if ($storage->exists($tempFilePath)) {
                $storage->delete($tempFilePath);
            }
            $this->cleanupChunks($uploadId, $fileUpload->disk);

            throw $e;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getUploadStatus(string $uploadId): ?array
    {
        $fileUpload = FileUpload::query()->where('upload_id', $uploadId)->first();

        if (! $fileUpload || $fileUpload->isExpired()) {
            return null;
        }

        $chunksInfo = $fileUpload->chunks_info ?? [];

        return [
            'upload_id' => $fileUpload->upload_id,
            'file_name' => $fileUpload->file_name,
            'total_chunks' => $fileUpload->total_chunks,
            'uploaded_chunks' => $fileUpload->uploaded_chunks,
            'uploaded_chunk_indices' => array_keys($chunksInfo),
            'expires_at' => $fileUpload->expires_at->toIso8601String(),
        ];
    }

    /**
     * Remove expired partial upload sessions and their chunk storage. Returns count cleaned.
     */
    public function cleanupStaleUploads(?Carbon $before = null): int
    {
        $before ??= now();

        $staleUploads = FileUpload::query()
            ->where('expires_at', '<', $before)
            ->get();

        $cleanedCount = 0;

        foreach ($staleUploads as $fileUpload) {
            $this->cleanupChunks($fileUpload->upload_id, $fileUpload->disk);
            $fileUpload->delete();
            $cleanedCount++;
        }

        return $cleanedCount;
    }

    /**
     * Compute the display path from parent hierarchy and name.
     */
    public function calculatePath(File $file): string
    {
        if ($file->parent_id === null) {
            return '/'.$file->name;
        }

        $parent = $file->parent;
        if (! $parent) {
            return '/'.$file->name;
        }

        $parentPath = $parent->path;
        if ($parentPath === '/') {
            return '/'.$file->name;
        }

        return rtrim($parentPath, '/').'/'.$file->name;
    }

    /**
     * Recalculate and persist paths for all descendants after a folder move or rename.
     */
    public function updateChildrenPaths(File $folder): void
    {
        foreach ($folder->children as $child) {
            $child->path = $this->calculatePath($child);
            $child->save();

            if ($child->isFolder()) {
                $this->updateChildrenPaths($child);
            }
        }
    }

    protected function generateStoragePath(string $fileName, string $disk): string
    {
        $extension = pathinfo($fileName, PATHINFO_EXTENSION);
        $basename = pathinfo($fileName, PATHINFO_FILENAME);
        $uniqueName = $basename.'_'.uniqid().($extension ? '.'.$extension : '');

        return date('Y/m').'/'.$uniqueName;
    }

    protected function validateNotDescendant(File $file, int $targetParentId): void
    {
        if ($targetParentId === $file->id) {
            throw new \InvalidArgumentException('Cannot move a file into itself.');
        }

        $target = File::query()->find($targetParentId);
        if (! $target) {
            return;
        }

        $current = $target;
        while ($current && $current->parent_id !== null) {
            if ($current->parent_id === $file->id) {
                throw new \InvalidArgumentException('Cannot move a folder into its own descendant.');
            }
            $current = $current->parent;
        }
    }

    protected function movePhysicalFileBetweenDisks(File $file, string $oldDisk, string $newDisk, string $oldPath, string $newPath): void
    {
        $oldStorage = Storage::disk($oldDisk);
        $newStorage = Storage::disk($newDisk);

        $contents = $oldStorage->get($oldPath);
        if ($contents !== false) {
            $newStorage->put($newPath, $contents);
            $oldStorage->delete($oldPath);
        }
    }

    protected function getChunkPath(string $uploadId, int $chunkIndex): string
    {
        return "chunks/{$uploadId}/chunk_{$chunkIndex}";
    }

    protected function getTempFilePath(string $uploadId): string
    {
        return "chunks/{$uploadId}/merged";
    }

    protected function cleanupChunks(string $uploadId, string $disk): void
    {
        $storage = Storage::disk($disk);
        $chunkDir = "chunks/{$uploadId}";

        try {
            foreach ($storage->allFiles($chunkDir) as $file) {
                $storage->delete($file);
            }
        } catch (\Throwable) {
            // Ignore cleanup errors.
        }
    }

    /**
     * @return array{0: ?int, 1: ?int, 2: array<string, mixed>}
     */
    protected function extractImageMeta(string $disk, string $path, ?string $mimeType, string $content): array
    {
        $width = null;
        $height = null;
        $meta = [];

        if (! $mimeType || ! str_starts_with($mimeType, 'image/')) {
            return [$width, $height, $meta];
        }

        try {
            if ($this->isLocalDisk($disk)) {
                $imagePath = Storage::disk($disk)->path($path);
                if (file_exists($imagePath)) {
                    $imageInfo = getimagesize($imagePath);
                }
            } else {
                $imageInfo = getimagesizefromstring($content);
            }

            if (isset($imageInfo) && $imageInfo !== false) {
                $width = $imageInfo[0];
                $height = $imageInfo[1];
                $meta['dimensions'] = ['width' => $width, 'height' => $height];
            }
        } catch (\Throwable) {
            // Ignore image processing failures.
        }

        return [$width, $height, $meta];
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    protected function resolveOrCreateVersion(
        string $disk,
        string $storagePath,
        string $fileHash,
        ?string $mimeType,
        int $size,
        ?int $width,
        ?int $height,
        array $meta,
        bool $moveFromTemp = false,
        ?string $fileName = null
    ): FileVersion {
        $existingVersion = FileVersion::query()->where('hash', $fileHash)->first();

        if ($existingVersion && Storage::disk($existingVersion->disk)->exists($existingVersion->storage_path)) {
            if (Storage::disk($disk)->exists($storagePath)) {
                Storage::disk($disk)->delete($storagePath);
            }

            return $existingVersion;
        }

        if ($moveFromTemp && $fileName !== null) {
            $finalStoragePath = $this->generateStoragePath($fileName, $disk);
            Storage::disk($disk)->move($storagePath, $finalStoragePath);
            $storagePath = $finalStoragePath;
        }

        return FileVersion::query()->create([
            'file_id' => null,
            'disk' => $disk,
            'storage_path' => $storagePath,
            'hash' => $fileHash,
            'mime_type' => $mimeType,
            'size' => $size,
            'width' => $width,
            'height' => $height,
            'meta' => $meta,
        ]);
    }

    protected function isLocalDisk(string $disk): bool
    {
        return Config::get("filesystems.disks.{$disk}.driver", '') === 'local';
    }
}
