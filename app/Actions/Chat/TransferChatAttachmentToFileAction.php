<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Models\CollectionItemChatAttachment;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Copy a chat attachment into the Files pool ("save to files", "add to
 * field"). Idempotent: an attachment is transferred once and later calls
 * return the same file.
 */
class TransferChatAttachmentToFileAction
{
    public function __construct(
        private FileService $fileService,
    ) {}

    /**
     * Writes the file to the Files pool disk and records it on the attachment
     * (`transferred_file_id`). Aborts 404 when the attachment has expired, its
     * stored file is gone, or the transferred file was deleted.
     */
    public function execute(CollectionItemChatAttachment $attachment): File
    {
        if ($attachment->transferred_file_id !== null) {
            $existing = $attachment->transferredFile;
            abort_unless($existing instanceof File, 404);

            return $existing;
        }

        abort_if($attachment->isExpired(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->path), 404);

        $uploaded = new UploadedFile(
            $attachment->absolutePath(),
            $attachment->original_name,
            $attachment->mime_type,
            null,
            true,
        );

        $file = $this->fileService->uploadFile($uploaded);
        $attachment->transferred_file_id = $file->id;
        $attachment->save();

        return $file;
    }
}
