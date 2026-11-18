<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Enums\FileTypeEnum;
use App\Jobs\WarmFileThumbnailJob;
use App\Models\File;
use App\Models\FileVersion;
use App\Services\FileTransformService;
use App\Services\Security\PlainTextSanitizerService;
use App\Services\Uploads\MimeTypeValidatorService;
use App\Services\Uploads\SafeUploadMimeService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Writes uploaded bytes into the file pool: single-body uploads, replacements, hash-deduplicated
 * versions, image dimensions and thumbnail warm-up. Chunked uploads reuse these steps.
 */
class FileUploadService
{
    public function __construct(
        private readonly FileStorageService $storage,
        private readonly FileTreeService $tree,
    ) {}

    /**
     * Store an uploaded file, deduplicate by hash when possible, and link a version row.
     *
     * Side effects: writes the bytes to the disk (deleted again on failure), queues a thumbnail
     * warm-up for images and dispatches the `file.created` webhook.
     *
     * @throws ValidationException When the upload is unreadable or its type is not allowed
     */
    public function uploadFile(UploadedFile $uploadedFile, ?int $parentId = null, ?string $disk = null, ?string $name = null): File
    {
        $disk = $this->resolveUploadDisk($disk, $parentId);
        $fileName = PlainTextSanitizerService::sanitize($name ?? $uploadedFile->getClientOriginalName()) ?? '';
        $field = $name !== null ? 'name' : 'file';
        $absolutePath = $this->absolutePathOfUpload($uploadedFile, $field);
        $sniffed = MimeTypeValidatorService::assertAllowedPath($fileName, $absolutePath, $field);
        $mimeType = SafeUploadMimeService::assertFilePoolAllowed($fileName, $sniffed, $field);
        $fileHash = $this->hashPathSha256($absolutePath);
        $size = $uploadedFile->getSize() ?: 0;
        $storagePath = $this->storage->generateStoragePath($fileName, $disk);
        $storedPath = null;

        try {
            $storedPath = Storage::disk($disk)->putFileAs(
                dirname($storagePath),
                $uploadedFile,
                basename($storagePath)
            );

            [$width, $height, $meta] = $this->extractImageMeta(
                $disk,
                $storedPath,
                $mimeType,
                $this->imageMetaContent($disk, $storedPath),
            );

            $file = DB::transaction(function () use ($parentId, $disk, $fileName, $mimeType, $size, $width, $height, $meta, $storedPath, $fileHash) {
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
                $file->path = $this->tree->calculatePath($file);
                $file->save();

                $this->dispatchThumbnailWarmup($file);

                return $file;
            });

            app(OutboundWebhookDispatcherService::class)->dispatchFile('file.created', $file);

            return $file;
        } catch (\Throwable $e) {
            if ($storedPath !== null) {
                Storage::disk($disk)->delete($storedPath);
            }

            throw $e;
        }
    }

    /**
     * Replace file bytes in storage and register a new version row.
     *
     * Side effects: clears cached transforms, writes the new bytes (deleted again on failure),
     * queues a thumbnail warm-up for images and dispatches the `file.updated` webhook.
     *
     * @throws \InvalidArgumentException When the target is not a file
     * @throws ValidationException When the upload is unreadable or its type is not allowed
     */
    public function replaceFile(File $file, UploadedFile $uploadedFile): File
    {
        if (! $file->isFile()) {
            throw new \InvalidArgumentException('Only files can be replaced.');
        }

        $absolutePath = $this->absolutePathOfUpload($uploadedFile, 'file');
        $originalName = $uploadedFile->getClientOriginalName();
        $sniffed = MimeTypeValidatorService::assertAllowedPath($originalName, $absolutePath, 'file');
        $mimeType = SafeUploadMimeService::assertFilePoolAllowed($originalName, $sniffed, 'file');
        $fileHash = $this->hashPathSha256($absolutePath);

        app(FileTransformService::class)->clearTransforms($file);

        $size = $uploadedFile->getSize() ?: 0;
        $storagePath = $this->storage->generateStoragePath($file->name, $file->disk);
        $storedPath = null;

        try {
            $storedPath = Storage::disk($file->disk)->putFileAs(
                dirname($storagePath),
                $uploadedFile,
                basename($storagePath)
            );

            [$width, $height, $meta] = $this->extractImageMeta(
                $file->disk,
                $storedPath,
                $mimeType,
                $this->imageMetaContent($file->disk, $storedPath),
            );

            $replaced = DB::transaction(function () use ($file, $storedPath, $fileHash, $mimeType, $size, $width, $height, $meta) {
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

                $this->dispatchThumbnailWarmup($file);

                return $file->fresh(['tags']);
            });

            app(OutboundWebhookDispatcherService::class)->dispatchFile('file.updated', $replaced);

            return $replaced;
        } catch (\Throwable $exception) {
            if ($storedPath !== null) {
                Storage::disk($file->disk)->delete($storedPath);
            }

            throw $exception;
        }
    }

    /**
     * Resolve upload disk from FILES_DISK / caller, then map privacy for local assets.
     */
    public function resolveUploadDisk(?string $disk, ?int $parentId): string
    {
        $disk ??= FilesDiskService::default();

        $parentPrivate = false;
        if ($parentId !== null) {
            $parent = File::query()->find($parentId);
            $parentPrivate = $parent?->isEffectivelyPrivate() ?? false;
        }

        return FilesDiskService::forEffectivePrivacy($parentPrivate, $disk);
    }

    /**
     * SHA-256 of a file on disk without loading the whole blob into a PHP string.
     *
     * @throws ValidationException When the file cannot be hashed
     */
    public function hashPathSha256(string $absolutePath): string
    {
        $hash = hash_file('sha256', $absolutePath);
        if ($hash === false) {
            throw ValidationException::withMessages([
                'file' => [__('Unable to hash uploaded file.')],
            ]);
        }

        return $hash;
    }

    /**
     * Absolute path for an UploadedFile temp body (streaming hash / MIME sniff).
     *
     * @throws ValidationException
     */
    public function absolutePathOfUpload(UploadedFile $uploadedFile, string $field = 'file'): string
    {
        $path = $uploadedFile->getRealPath();
        if ($path === false || $path === '') {
            throw ValidationException::withMessages([
                $field => [__('Unable to read uploaded file.')],
            ]);
        }

        return $path;
    }

    /**
     * Image meta payload for extractImageMeta: empty on local disks (uses path);
     * remote disks still need bytes for getimagesizefromstring.
     */
    public function imageMetaContent(string $disk, string $path): string
    {
        if ($this->isLocalDisk($disk)) {
            return '';
        }

        $contents = Storage::disk($disk)->get($path);

        return is_string($contents) ? $contents : '';
    }

    /**
     * Width, height and `meta.dimensions` for images; failures are reported, never thrown.
     *
     * @return array{0: ?int, 1: ?int, 2: array<string, mixed>}
     */
    public function extractImageMeta(string $disk, string $path, ?string $mimeType, string $content): array
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
        } catch (\Throwable $exception) {
            // Ignore image processing failures, but keep them visible.
            report($exception);
        }

        return [$width, $height, $meta];
    }

    /**
     * Reuse the version row of identical bytes (same hash, still on disk) or create a new one.
     *
     * Side effects: deletes the just-written bytes when an existing version is reused; with
     * `$moveFromTemp` moves the temp bytes to a final storage path first.
     *
     * @param  array<string, mixed>  $meta
     */
    public function resolveOrCreateVersion(
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
            $finalStoragePath = $this->storage->generateStoragePath($fileName, $disk);
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

    /**
     * Queue a best-effort thumbnail warm-up for raster images.
     *
     * Side effect: dispatches {@see WarmFileThumbnailJob}.
     */
    public function dispatchThumbnailWarmup(File $file): void
    {
        if (! app(FileTransformService::class)->isImage($file)) {
            return;
        }

        WarmFileThumbnailJob::dispatch($file->id);
    }

    private function isLocalDisk(string $disk): bool
    {
        return Config::get("filesystems.disks.{$disk}.driver", '') === 'local';
    }
}
