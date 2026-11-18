<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\StoreAiChatAttachmentRequest;
use App\Models\AiChatAttachment;
use App\Models\User;
use App\Services\Uploads\ForbiddenUploadExtensionService;
use App\Services\Uploads\MimeTypeValidatorService;
use App\Services\Uploads\SafeUploadMimeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accept temporary chat attachment uploads for the AI assistant.
 */
class AiChatAttachmentController extends Controller
{
    /**
     * Store a validated chat attachment and return its display metadata.
     *
     *
     * @throws ValidationException
     */
    public function store(StoreAiChatAttachmentRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

        /** @var UploadedFile $uploaded */
        $uploaded = $validated['file'];

        $originalName = $uploaded->getClientOriginalName() !== ''
            ? $uploaded->getClientOriginalName()
            : 'attachment.bin';
        ForbiddenUploadExtensionService::assertAllowed($originalName);
        $bytes = $uploaded->getContent();
        $sniffed = MimeTypeValidatorService::assertAllowed($originalName, $bytes);

        $extension = SafeUploadMimeService::extensionOf($originalName);
        $extensionAllowed = in_array($extension, AiChatAttachment::ALLOWED_EXTENSIONS, true);
        $mimeAllowed = in_array($sniffed, AiChatAttachment::ALLOWED_MIME_TYPES, true)
            || ($sniffed === 'application/octet-stream' && $extensionAllowed);

        if (! $extensionAllowed || ! $mimeAllowed) {
            throw ValidationException::withMessages([
                'file' => __('Unsupported file type. Upload CSV, TXT, XLSX, or PDF.'),
            ]);
        }

        if ($uploaded->getSize() > AiChatAttachment::MAX_BYTES) {
            throw ValidationException::withMessages([
                'file' => __('The file exceeds the 5 MB limit.'),
            ]);
        }

        $storedMimeType = match (true) {
            $extension === 'csv' => 'text/csv',
            $extension === 'txt' => 'text/plain',
            $extension === 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            $extension === 'pdf' => 'application/pdf',
            default => $sniffed !== '' ? $sniffed : 'text/plain',
        };

        $attachmentId = (string) Str::uuid7();
        $safeName = Str::slug(pathinfo($uploaded->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'attachment';
        $storagePath = sprintf(
            'ai-chat-attachments/%d/%s.%s',
            $user->id,
            $attachmentId,
            $extension,
        );

        Storage::disk(AiChatAttachment::DISK)->put($storagePath, $bytes);

        $attachment = AiChatAttachment::query()->create([
            'id' => $attachmentId,
            'user_id' => $user->id,
            'original_name' => $uploaded->getClientOriginalName() !== ''
                ? $uploaded->getClientOriginalName()
                : "{$safeName}.{$extension}",
            'mime_type' => $storedMimeType,
            'disk' => AiChatAttachment::DISK,
            'path' => $storagePath,
            'size' => (int) $uploaded->getSize(),
            'expires_at' => now()->addHours(AiChatAttachment::TTL_HOURS),
        ]);

        return response()->json([
            'attachment' => [
                'id' => $attachment->id,
                'name' => $attachment->original_name,
                'mime' => $attachment->mime_type,
                'size' => $attachment->size,
            ],
        ], Response::HTTP_CREATED);
    }
}
