<?php

namespace App\Services\Chat;

use App\Models\ChatAttachmentUpload;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\FileTransformService;
use App\Services\Settings\ProjectSettings;
use App\Support\Uploads\ForbiddenUploadExtension;
use App\Support\Uploads\SafeUploadMime;
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
     */
    public function storeSingle(User $user, UploadedFile $uploaded): CollectionItemChatAttachment
    {
        $size = (int) $uploaded->getSize();
        UploadSizeLimiter::assertWithinCap($this->projectSettings->chatMaxUploadBytes(), $size);
        UploadSizeLimiter::assertFitsPhpSingleUpload($size);

        $clientName = $uploaded->getClientOriginalName();
        $originalName = $clientName !== '' ? $clientName : 'attachment.bin';
        $contents = $uploaded->getContent();
        $mimeType = SafeUploadMime::assertChatAllowed($originalName, SafeUploadMime::sniff($contents), 'file', $contents);
        $extension = SafeUploadMime::extensionOf($originalName);
        $attachmentId = (string) Str::uuid7();
        $safeName = Str::slug(pathinfo($originalName, PATHINFO_FILENAME)) ?: 'attachment';
        $storagePath = sprintf(
            'chat-attachments/%d/%s.%s',
            $user->id,
            $attachmentId,
            $extension !== '' ? $extension : 'bin',
        );

        Storage::disk(CollectionItemChatAttachment::DISK)->put($storagePath, $contents);

        $preview = $this->maybeWritePreview($user->id, $attachmentId, $mimeType, $contents);

        return CollectionItemChatAttachment::query()->create([
            'id' => $attachmentId,
            'user_id' => $user->id,
            'original_name' => $clientName !== '' ? $originalName : "{$safeName}.{$extension}",
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
     * Start a chunked upload session.
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

        // Reject forbidden / non-allowlisted names at init (content re-checked on complete).
        $extension = SafeUploadMime::extensionOf($fileName);
        if ($extension === '' || ! isset(SafeUploadMime::CHAT_EXTENSION_MIMES[$extension])) {
            throw ValidationException::withMessages([
                'file_name' => ['This file type is not allowed.'],
            ]);
        }
        ForbiddenUploadExtension::assertAllowed($fileName, 'file_name');

        $uploadId = bin2hex(random_bytes(32));

        return ChatAttachmentUpload::query()->create([
            'upload_id' => $uploadId,
            'user_id' => $user->id,
            'file_name' => $fileName,
            // Client mime is a hint only; complete() re-sniffs and ignores this.
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

        // Always re-sniff assembled bytes; never trust client mime_type.
        $mimeType = SafeUploadMime::assertChatAllowed(
            (string) $fileUpload->file_name,
            SafeUploadMime::sniff($assembled),
            'file_name',
            $assembled,
        );
        $extension = SafeUploadMime::extensionOf((string) $fileUpload->file_name);

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
            'mime_type' => $mimeType,
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
     * @return array{path: string, mime: string}|null
     */
    private function maybeWritePreview(int $userId, string $attachmentId, string $mimeType, string $contents): ?array
    {
        if (! SafeUploadMime::isInlineImage($mimeType)) {
            return null;
        }

        try {
            $encoded = $this->transforms->encodePreviewFromBinary($contents, self::PREVIEW_MAX_EDGE);
        } catch (\Throwable $exception) {
            report($exception);

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
