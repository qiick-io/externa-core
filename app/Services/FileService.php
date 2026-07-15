<?php

namespace App\Services;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\FileVersion;
use App\Traits\HasFiles;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FileService
{
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

    public function softDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach ($file->children as $child) {
                $this->softDelete($child);
            }

            $file->delete();
        });
    }

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

    public function forceDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach (File::query()->withTrashed()->where('parent_id', $file->id)->get() as $child) {
                $this->forceDelete($child);
            }

            if ($file->isFile() && $file->storage_path) {
                Storage::disk($file->disk)->delete($file->storage_path);
            }

            $file->forceDelete();
        });
    }

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
