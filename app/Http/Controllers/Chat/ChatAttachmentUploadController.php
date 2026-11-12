<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\FindChatAttachmentUploadRequest;
use App\Http\Requests\Chat\InitChatAttachmentUploadRequest;
use App\Http\Requests\Chat\UploadChatAttachmentChunkRequest;
use App\Models\Chat;
use App\Models\User;
use App\Services\Chat\ChatAttachmentUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Chunked chat attachment uploads keyed by Chat UUID (init, chunk, complete,
 * status). The form requests authorize access to the thread.
 */
class ChatAttachmentUploadController extends Controller
{
    public function __construct(
        private ChatAttachmentUploadService $chatUploads,
    ) {}

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function initAttachmentUploadOnChat(InitChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $upload = $this->chatUploads->init(
            $user,
            $validated['file_name'],
            (int) $validated['total_size'],
            (int) $validated['total_chunks'],
            $validated['mime_type'] ?? null,
        );

        return response()->json([
            'upload_id' => $upload->upload_id,
            'expires_at' => $upload->expires_at->toIso8601String(),
        ], 201);
    }

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function uploadAttachmentChunkOnChat(UploadChatAttachmentChunkRequest $request, Chat $chat): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $this->chatUploads->uploadChunk(
            $user,
            $validated['upload_id'],
            (int) $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function completeAttachmentUploadOnChat(FindChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $attachment = $this->chatUploads->complete($user, $request->validated()['upload_id']);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function attachmentUploadStatusOnChat(FindChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $status = $this->chatUploads->status($user, $request->validated()['upload_id']);

        if ($status === null) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }
}
