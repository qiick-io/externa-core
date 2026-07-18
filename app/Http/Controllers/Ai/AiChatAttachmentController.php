<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiChatAttachment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class AiChatAttachmentController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:'.(AiChatAttachment::MAX_BYTES / 1024)],
        ]);

        /** @var UploadedFile $uploaded */
        $uploaded = $validated['file'];

        $extension = strtolower((string) $uploaded->getClientOriginalExtension());
        $mimeType = strtolower((string) ($uploaded->getMimeType() ?: $uploaded->getClientMimeType() ?: ''));
        $extensionAllowed = in_array($extension, AiChatAttachment::ALLOWED_EXTENSIONS, true);
        $mimeAllowed = in_array($mimeType, AiChatAttachment::ALLOWED_MIME_TYPES, true)
            || ($mimeType === 'application/octet-stream' && $extensionAllowed);

        if (! $extensionAllowed || ! $mimeAllowed) {
            throw ValidationException::withMessages([
                'file' => 'Tipo di file non supportato. Carica CSV, TXT, XLSX o PDF.',
            ]);
        }

        if ($uploaded->getSize() > AiChatAttachment::MAX_BYTES) {
            throw ValidationException::withMessages([
                'file' => 'Il file supera il limite di 5 MB.',
            ]);
        }

        $storedMimeType = match (true) {
            $extension === 'csv' => 'text/csv',
            $extension === 'txt' => 'text/plain',
            $extension === 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            $extension === 'pdf' => 'application/pdf',
            default => $mimeType !== '' ? $mimeType : 'text/plain',
        };

        $attachmentId = (string) Str::uuid7();
        $safeName = Str::slug(pathinfo($uploaded->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'attachment';
        $storagePath = sprintf(
            'ai-chat-attachments/%d/%s.%s',
            $user->id,
            $attachmentId,
            $extension,
        );

        Storage::disk(AiChatAttachment::DISK)->put($storagePath, $uploaded->getContent());

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
