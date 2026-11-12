<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\File;
use App\Models\FileUpload;
use App\Models\User;
use App\Services\Files\FileAttachmentService;
use App\Services\Files\FileCopyService;
use App\Services\Files\FileMetadataService;
use App\Services\Files\FilePrivacyDiskService;
use App\Services\Files\FileTrashService;
use App\Services\Files\FileTreeService;
use App\Services\Files\FileUploadService;
use App\Services\Files\FileZipService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Stable façade over the file-manager services in `App\Services\Files`.
 *
 * Controllers, Actions, the REST API, AI tools, jobs and commands (and products built on
 * externa-core) call this one entry point; every method delegates to the service that owns the
 * responsibility, so new logic goes there, never here. The chunk-upload methods stay for
 * existing callers only: new code calls {@see FileChunkUploadService} directly.
 */
class FileService
{
    public function __construct(
        private readonly FileTreeService $tree,
        private readonly FileUploadService $uploads,
        private readonly FileMetadataService $metadata,
        private readonly FilePrivacyDiskService $privacyDisks,
        private readonly FileCopyService $copies,
        private readonly FileTrashService $trash,
        private readonly FileZipService $zips,
        private readonly FileAttachmentService $attachments,
        private readonly FileChunkUploadService $chunkUploads,
    ) {}

    /**
     * @see FileTreeService::createFolder()
     */
    public function createFolder(string $name, ?int $parentId = null, ?string $disk = null): File
    {
        return $this->tree->createFolder($name, $parentId, $disk);
    }

    /**
     * @see FileUploadService::uploadFile()
     *
     * @throws ValidationException When the upload is unreadable or its type is not allowed
     */
    public function uploadFile(UploadedFile $uploadedFile, ?int $parentId = null, ?string $disk = null, ?string $name = null): File
    {
        return $this->uploads->uploadFile($uploadedFile, $parentId, $disk, $name);
    }

    /**
     * @see FileUploadService::replaceFile()
     *
     * @throws \InvalidArgumentException When the target is not a file
     */
    public function replaceFile(File $file, UploadedFile $uploadedFile): File
    {
        return $this->uploads->replaceFile($file, $uploadedFile);
    }

    /**
     * @see FileUploadService::hashPathSha256()
     */
    public function hashPathSha256(string $absolutePath): string
    {
        return $this->uploads->hashPathSha256($absolutePath);
    }

    /**
     * @see FileUploadService::absolutePathOfUpload()
     */
    public function absolutePathOfUpload(UploadedFile $uploadedFile, string $field = 'file'): string
    {
        return $this->uploads->absolutePathOfUpload($uploadedFile, $field);
    }

    /**
     * @see FileTreeService::move()
     *
     * @throws HttpResponseException When optimistic lock fails (409)
     */
    public function move(File $file, ?int $targetParentId, ?string $targetDisk = null, ?Carbon $version = null): File
    {
        return $this->tree->move($file, $targetParentId, $targetDisk, $version);
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkMove(array $fileIds, ?int $targetParentId): array
    {
        return $this->tree->bulkMove($fileIds, $targetParentId);
    }

    /**
     * @see FileTreeService::rename()
     */
    public function rename(File $file, string $newName): File
    {
        return $this->tree->rename($file, $newName);
    }

    /**
     * @see FileMetadataService::updateMetadata()
     *
     * @param  array<string, mixed>  $attributes
     */
    public function updateMetadata(File $file, array $attributes): File
    {
        return $this->metadata->updateMetadata($file, $attributes);
    }

    /**
     * @param  list<string>  $tagNames
     */
    public function syncTags(File $file, array $tagNames): File
    {
        return $this->metadata->syncTags($file, $tagNames);
    }

    /**
     * @param  list<int>  $fileIds
     * @param  list<string>  $tagNames
     * @return list<File>
     */
    public function bulkTag(array $fileIds, array $tagNames, bool $attach): array
    {
        return $this->metadata->bulkTag($fileIds, $tagNames, $attach);
    }

    public function favorite(File $file, User $user): void
    {
        $this->metadata->favorite($file, $user);
    }

    public function unfavorite(File $file, User $user): void
    {
        $this->metadata->unfavorite($file, $user);
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkFavorite(array $fileIds, User $user, bool $favorite): array
    {
        return $this->metadata->bulkFavorite($fileIds, $user, $favorite);
    }

    /**
     * @see FilePrivacyDiskService::migratePrivateFilesToPrivateDisk()
     */
    public function migratePrivateFilesToPrivateDisk(): int
    {
        return $this->privacyDisks->migratePrivateFilesToPrivateDisk();
    }

    /**
     * @see FileCopyService::copy()
     */
    public function copy(File $file, ?int $targetParentId = null): File
    {
        return $this->copies->copy($file, $targetParentId);
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkCopy(array $fileIds, ?int $targetParentId = null): array
    {
        return $this->copies->bulkCopy($fileIds, $targetParentId);
    }

    /**
     * @see FileTrashService::softDelete()
     */
    public function softDelete(File $file): void
    {
        $this->trash->softDelete($file);
    }

    /**
     * @see FileTrashService::restore()
     */
    public function restore(File $file): File
    {
        return $this->trash->restore($file);
    }

    /**
     * @see FileTrashService::forceDelete()
     */
    public function forceDelete(File $file): void
    {
        $this->trash->forceDelete($file);
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkSoftDelete(array $fileIds): void
    {
        $this->trash->bulkSoftDelete($fileIds);
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkRestore(array $fileIds): void
    {
        $this->trash->bulkRestore($fileIds);
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkForceDelete(array $fileIds): void
    {
        $this->trash->bulkForceDelete($fileIds);
    }

    /**
     * @see FileZipService::zipStoragePath()
     */
    public function zipStoragePath(int $userId, string $jobId): string
    {
        return $this->zips->zipStoragePath($userId, $jobId);
    }

    /**
     * @see FileZipService::buildZipArchive()
     *
     * @param  list<int>  $fileIds
     *
     * @throws \RuntimeException When the archive cannot be created or exceeds max size
     */
    public function buildZipArchive(array $fileIds, ?string $destinationPath = null, ?int $maxBytes = null): string
    {
        return $this->zips->buildZipArchive($fileIds, $destinationPath, $maxBytes);
    }

    /**
     * @see FileZipService::cleanupExpiredZips()
     */
    public function cleanupExpiredZips(): int
    {
        return $this->zips->cleanupExpiredZips();
    }

    /**
     * @see FileAttachmentService::attachToModel()
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function attachToModel(File $file, string $modelType, int $modelId, ?string $role = null, int $order = 0): void
    {
        $this->attachments->attachToModel($file, $modelType, $modelId, $role, $order);
    }

    /**
     * @see FileAttachmentService::detachFromModel()
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function detachFromModel(File $file, string $modelType, int $modelId, ?string $role = null): void
    {
        $this->attachments->detachFromModel($file, $modelType, $modelId, $role);
    }

    /**
     * @see FileChunkUploadService::initChunkUpload()
     */
    public function initChunkUpload(string $fileName, int $totalSize, int $totalChunks, ?string $mimeType = null, ?int $parentId = null, ?string $disk = null): FileUpload
    {
        return $this->chunkUploads->initChunkUpload($fileName, $totalSize, $totalChunks, $mimeType, $parentId, $disk);
    }

    /**
     * @see FileChunkUploadService::uploadChunk()
     */
    public function uploadChunk(string $uploadId, int $chunkIndex, UploadedFile $chunk): void
    {
        $this->chunkUploads->uploadChunk($uploadId, $chunkIndex, $chunk);
    }

    /**
     * @see FileChunkUploadService::completeChunkUpload()
     */
    public function completeChunkUpload(string $uploadId): File
    {
        return $this->chunkUploads->completeChunkUpload($uploadId);
    }

    /**
     * @see FileChunkUploadService::getUploadStatus()
     *
     * @return array<string, mixed>|null
     */
    public function getUploadStatus(string $uploadId): ?array
    {
        return $this->chunkUploads->getUploadStatus($uploadId);
    }

    /**
     * @see FileChunkUploadService::cleanupStaleUploads()
     */
    public function cleanupStaleUploads(?Carbon $before = null): int
    {
        return $this->chunkUploads->cleanupStaleUploads($before);
    }
}
