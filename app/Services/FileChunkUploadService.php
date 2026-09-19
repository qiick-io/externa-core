<?php

namespace App\Services;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Models\FileUpload;
use App\Support\Security\PlainTextSanitizer;
use App\Support\Uploads\ForbiddenUploadExtension;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Chunked file upload lifecycle (init / chunk / complete / status / stale cleanup).
 */
class FileChunkUploadService
{
    /**
     * Begin a chunked upload session and return tracking metadata.
     */
    public function initChunkUpload(string $fileName, int $totalSize, int $totalChunks, ?string $mimeType = null, ?int $parentId = null, ?string $disk = null): FileUpload
    {
        $disk = $this->files()->resolveUploadDisk($disk, $parentId);

        $fileName = PlainTextSanitizer::sanitize($fileName) ?? '';
        ForbiddenUploadExtension::assertAllowed($fileName, 'file_name');

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
        $files = $this->files();
        $fileUpload = FileUpload::query()->where('upload_id', $uploadId)->firstOrFail();

        ForbiddenUploadExtension::assertAllowed((string) $fileUpload->file_name, 'file_name');

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

            [$width, $height, $meta] = $files->extractImageMeta(
                $fileUpload->disk,
                $tempFilePath,
                $fileUpload->mime_type,
                $fileContent
            );

            $version = $files->resolveOrCreateVersion(
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

            $file = DB::transaction(function () use ($fileUpload, $fileHash, $width, $height, $meta, $version, $files) {
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
                $file->path = $files->calculatePath($file);
                $file->save();

                return $file;
            });

            $this->cleanupChunks($uploadId, $fileUpload->disk);
            $fileUpload->delete();

            $files->dispatchThumbnailWarmup($file);

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
     * Lazy resolve to avoid circular constructor DI with FileService façade.
     */
    private function files(): FileService
    {
        return app(FileService::class);
    }

    private function getChunkPath(string $uploadId, int $chunkIndex): string
    {
        return "chunks/{$uploadId}/chunk_{$chunkIndex}";
    }

    private function getTempFilePath(string $uploadId): string
    {
        return "chunks/{$uploadId}/merged";
    }

    private function cleanupChunks(string $uploadId, string $disk): void
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
}
