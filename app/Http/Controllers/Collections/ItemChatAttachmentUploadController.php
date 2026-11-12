<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\FindChatAttachmentUploadRequest;
use App\Http\Requests\Chat\InitChatAttachmentUploadRequest;
use App\Http\Requests\Chat\UploadChatAttachmentChunkRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Chat\ChatAttachmentUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Item-form chat alias for chunked attachment uploads (init, chunk, complete,
 * status). The form requests authorize the item context.
 */
class ItemChatAttachmentUploadController extends Controller
{
    public function __construct(
        private ChatAttachmentUploadService $chatUploads,
    ) {}

    public function initAttachmentUpload(InitChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
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

    public function uploadAttachmentChunk(UploadChatAttachmentChunkRequest $request, Collection $collection, CollectionItem $item): Response
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

    public function completeAttachmentUpload(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $attachment = $this->chatUploads->complete($user, $request->validated()['upload_id']);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function attachmentUploadStatus(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
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
