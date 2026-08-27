<?php

namespace App\Services\Chat;

use App\Models\ChatAttachmentUpload;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\FileTransformService;
use App\Services\Settings\ProjectSettings;
use App\Support\Uploads\UploadSizeLimiter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Chunked chat attachment uploads (storage isolated from Files pool).
 */
class ChatAttachmentUploadService
{
    public const CHUNK_THRESHOLD_BYTES = 10 * 1024 * 1024;

    public const PREVIEW_MAX_EDGE = 1200;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
        private readonly FileTransformService $transforms,
    ) {}

    /**
     * Persist a single-request orphan attachment (with optional image preview).
     *
     * @throws ValidationException
     */
    public function storeSingle(User $user, UploadedFile $uploaded): CollectionItemChatAttachment
    {
        $this->assertAllowedType($uploaded);
        $size = (int) $uploaded->getSize();
        UploadSizeLimiter::assertWithinCap($this->projectSettings->chatMaxUploadBytes(), $size);
        UploadSizeLimiter::assertFitsPhpSingleUpload($size);

        $extension = strtolower((string) $uploaded->getClientOriginalExtension());
        $mimeType = $this->resolveMime($uploaded, $extension);
        $attachmentId = (string) Str::uuid7();
        $safeName = Str::slug(pathinfo($uploaded->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'attachment';
        $storagePath = sprintf(
            'chat-attachments/%d/%s.%s',
            $user->id,
            $attachmentId,
            $extension !== '' ? $extension : 'bin',
        );

        $contents = $uploaded->getContent();
        Storage::disk(CollectionItemChatAttachment::DISK)->put($storagePath, $contents);

        $preview = $this->maybeWritePreview($user->id, $attachmentId, $mimeType, $contents);

        return CollectionItemChatAttachment::query()->create([
            'id' => $attachmentId,
            'user_id' => $user->id,
            'original_name' => $uploaded->getClientOriginalName() !== ''
                ? $uploaded->getClientOriginalName()
                : "{$safeName}.{$extension}",
            'mime_type' => $mimeType,
            'disk' => CollectionItemChatAttachment::DISK,
            'path' => $storagePath,
            'preview_path' => $preview['path'] ?? null,
            'preview_mime' => $preview['mime'] ?? null,
            'size' => $size,
            'expires_at' => now()->addHours(CollectionItemChatAttachment::TTL_HOURS),
        ]);
    }

    /**
     * @throws ValidationException
     */
    public function init(
        User $user,
        string $fileName,
        int $totalSize,
        int $totalChunks,
        ?string $mimeType = null,
    ): ChatAttachmentUpload {
        UploadSizeLimiter::assertWithinCap(
            $this->projectSettings->chatMaxUploadBytes(),
            $totalSize,
            'total_size',
        );

        $extension = strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION));
        $this->assertExtensionAndMime($extension, $mimeType);

        $uploadId = bin2hex(random_bytes(32));

        return ChatAttachmentUpload::query()->create([
            'upload_id' => $uploadId,
            'user_id' => $user->id,
            'file_name' => $fileName,
            'mime_type' => $mimeType,
            'total_size' => $totalSize,
            'total_chunks' => $totalChunks,
            'uploaded_chunks' => 0,
            'chunks_info' => [],
            'expires_at' => now()->addHours(CollectionItemChatAttachment::TTL_HOURS),
        ]);
    }

    /**
     * @throws RuntimeException
     */
    public function uploadChunk(User $user, string $uploadId, int $chunkIndex, UploadedFile $chunk): void
    {
        $fileUpload = ChatAttachmentUpload::query()
            ->where('upload_id', $uploadId)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($fileUpload->isExpired()) {
            throw new RuntimeException('Upload session has expired.');
        }

        if ($fileUpload->isComplete()) {
            throw new RuntimeException('All chunks have already been uploaded.');
        }

        if ($chunkIndex < 0 || $chunkIndex >= $fileUpload->total_chunks) {
            throw new \InvalidArgumentException("Invalid chunk index: {$chunkIndex}");
        }

        $chunkPath = $this->chunkPath($uploadId, $chunkIndex);
        Storage::disk(CollectionItemChatAttachment::DISK)->put($chunkPath, $chunk->getContent());

        DB::transaction(function () use ($fileUpload, $chunkIndex): void {
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
     * @throws RuntimeException
     * @throws ValidationException
     */
    public function complete(User $user, string $uploadId): CollectionItemChatAttachment
    {
        $fileUpload = ChatAttachmentUpload::query()
            ->where('upload_id', $uploadId)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($fileUpload->isExpired()) {
            throw new RuntimeException('Upload session has expired.');
        }

        if (! $fileUpload->isComplete()) {
            throw new RuntimeException('Not all chunks have been uploaded.');
        }

        UploadSizeLimiter::assertWithinCap(
            $this->projectSettings->chatMaxUploadBytes(),
            (int) $fileUpload->total_size,
            'total_size',
        );

        $disk = Storage::disk(CollectionItemChatAttachment::DISK);
        $assembled = '';

        for ($index = 0; $index < $fileUpload->total_chunks; $index++) {
            $chunkPath = $this->chunkPath($uploadId, $index);

            if (! $disk->exists($chunkPath)) {
                throw new RuntimeException("Missing chunk {$index}.");
            }

            $piece = $disk->get($chunkPath);

            if ($piece === false) {
                throw new RuntimeException("Unable to read chunk {$index}.");
            }

            $assembled .= $piece;
        }

        if (strlen($assembled) !== (int) $fileUpload->total_size) {
            throw new RuntimeException('Assembled size does not match declared total_size.');
        }

        $extension = strtolower((string) pathinfo($fileUpload->file_name, PATHINFO_EXTENSION));
        $mimeType = is_string($fileUpload->mime_type) && $fileUpload->mime_type !== ''
            ? strtolower($fileUpload->mime_type)
            : $this->mimeFromExtension($extension);

        $this->assertExtensionAndMime($extension, $mimeType);

        $attachmentId = (string) Str::uuid7();
        $storagePath = sprintf(
            'chat-attachments/%d/%s.%s',
            $user->id,
            $attachmentId,
            $extension !== '' ? $extension : 'bin',
        );

        $disk->put($storagePath, $assembled);
        $preview = $this->maybeWritePreview($user->id, $attachmentId, $mimeType, $assembled);

        $attachment = CollectionItemChatAttachment::query()->create([
            'id' => $attachmentId,
            'user_id' => $user->id,
            'original_name' => $fileUpload->file_name,
            'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream',
            'disk' => CollectionItemChatAttachment::DISK,
            'path' => $storagePath,
            'preview_path' => $preview['path'] ?? null,
            'preview_mime' => $preview['mime'] ?? null,
            'size' => (int) $fileUpload->total_size,
            'expires_at' => now()->addHours(CollectionItemChatAttachment::TTL_HOURS),
        ]);

        $this->deleteChunks($uploadId, $fileUpload->total_chunks);
        $fileUpload->delete();

        return $attachment;
    }

    /**
     * @return array{upload_id: string, uploaded_chunks: int, total_chunks: int, total_size: int, expires_at: string}|null
     */
    public function status(User $user, string $uploadId): ?array
    {
        $fileUpload = ChatAttachmentUpload::query()
            ->where('upload_id', $uploadId)
            ->where('user_id', $user->id)
            ->first();

        if ($fileUpload === null || $fileUpload->isExpired()) {
            return null;
        }

        return [
            'upload_id' => $fileUpload->upload_id,
            'uploaded_chunks' => $fileUpload->uploaded_chunks,
            'total_chunks' => $fileUpload->total_chunks,
            'total_size' => $fileUpload->total_size,
            'expires_at' => $fileUpload->expires_at->toIso8601String(),
        ];
    }

    public function cleanupStaleUploads(): int
    {
        $stale = ChatAttachmentUpload::query()
            ->where('expires_at', '<', now())
            ->get();

        $count = 0;

        foreach ($stale as $upload) {
            $this->deleteChunks($upload->upload_id, $upload->total_chunks);
            $upload->delete();
            $count++;
        }

        return $count;
    }

    /**
     * @throws ValidationException
     */
    private function assertAllowedType(UploadedFile $uploaded): void
    {
        $extension = strtolower((string) $uploaded->getClientOriginalExtension());
        $mimeType = strtolower((string) ($uploaded->getMimeType() ?: $uploaded->getClientMimeType() ?: ''));
        $this->assertExtensionAndMime($extension, $mimeType);
    }

    /**
     * @throws ValidationException
     */
    private function assertExtensionAndMime(string $extension, ?string $mimeType): void
    {
        $mime = is_string($mimeType) ? strtolower($mimeType) : '';
        $extensionAllowed = in_array($extension, CollectionItemChatAttachment::ALLOWED_EXTENSIONS, true);
        $mimeAllowed = in_array($mime, CollectionItemChatAttachment::ALLOWED_MIME_TYPES, true)
            || ($mime === 'application/octet-stream' && $extensionAllowed)
            || ($mime === '' && $extensionAllowed);

        if (! $extensionAllowed || ! $mimeAllowed) {
            throw ValidationException::withMessages([
                'file' => ['Unsupported file type.'],
            ]);
        }
    }

    private function resolveMime(UploadedFile $uploaded, string $extension): string
    {
        $mimeType = strtolower((string) ($uploaded->getMimeType() ?: $uploaded->getClientMimeType() ?: ''));

        if ($mimeType !== '') {
            return $mimeType;
        }

        return $this->mimeFromExtension($extension);
    }

    private function mimeFromExtension(string $extension): string
    {
        return match ($extension) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'pdf' => 'application/pdf',
            'doc' => 'application/msword',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls' => 'application/vnd.ms-excel',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt' => 'text/plain',
            'csv' => 'text/csv',
            default => 'application/octet-stream',
        };
    }

    /**
     * @return array{path: string, mime: string}|null
     */
    private function maybeWritePreview(int $userId, string $attachmentId, string $mimeType, string $contents): ?array
    {
        if (! str_starts_with($mimeType, 'image/') || $mimeType === 'image/svg+xml') {
            return null;
        }

        try {
            $encoded = $this->transforms->encodePreviewFromBinary($contents, self::PREVIEW_MAX_EDGE);
        } catch (\Throwable) {
            return null;
        }

        $previewPath = sprintf(
            'chat-attachments/%d/%s.preview.%s',
            $userId,
            $attachmentId,
            $encoded['extension'],
        );

        Storage::disk(CollectionItemChatAttachment::DISK)->put($previewPath, $encoded['binary']);

        return [
            'path' => $previewPath,
            'mime' => $encoded['mime'],
        ];
    }

    private function chunkPath(string $uploadId, int $chunkIndex): string
    {
        return sprintf('chat-attachment-uploads/%s/chunk-%d', $uploadId, $chunkIndex);
    }

    private function deleteChunks(string $uploadId, int $totalChunks): void
    {
        $disk = Storage::disk(CollectionItemChatAttachment::DISK);

        for ($index = 0; $index < $totalChunks; $index++) {
            $path = $this->chunkPath($uploadId, $index);

            if ($disk->exists($path)) {
                $disk->delete($path);
            }
        }

        $dir = sprintf('chat-attachment-uploads/%s', $uploadId);

        if (method_exists($disk, 'deleteDirectory')) {
            $disk->deleteDirectory($dir);
        }
    }
}
