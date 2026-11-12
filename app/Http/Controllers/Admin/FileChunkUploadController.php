<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Files\InitChunkUploadAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\InitChunkUploadRequest;
use App\Http\Requests\Admin\Files\ResolveChunkUploadRequest;
use App\Http\Requests\Admin\Files\UploadChunkRequest;
use App\Http\Resources\Admin\FileResource;
use App\Services\FileService;
use App\Support\Files\FilesDisk;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * File manager resumable uploads: open a session, send chunks, finish, and poll progress.
 */
class FileChunkUploadController extends Controller
{
    public function __construct(
        protected FileService $fileService,
        protected InitChunkUploadAction $initChunkUploadAction,
    ) {}

    /**
     * Initialize a resumable chunked upload session.
     */
    public function initChunkUpload(InitChunkUploadRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $fileUpload = $this->initChunkUploadAction->execute(
            $validated['file_name'],
            (int) $validated['total_size'],
            (int) $validated['total_chunks'],
            $validated['mime_type'] ?? null,
            $request->validatedParentId(),
            $validated['disk'] ?? FilesDisk::default(),
        );

        return response()->json([
            'upload_id' => $fileUpload->upload_id,
            'expires_at' => $fileUpload->expires_at->toIso8601String(),
        ], 201);
    }

    /**
     * Upload one chunk for an in-progress resumable upload.
     */
    public function uploadChunk(UploadChunkRequest $request): Response
    {
        $validated = $request->validated();

        $this->fileService->uploadChunk(
            $validated['upload_id'],
            (int) $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    /**
     * Finalize a chunked upload and create the file record.
     */
    public function completeChunkUpload(ResolveChunkUploadRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $file = $this->fileService->completeChunkUpload($validated['upload_id']);

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Return progress metadata for an in-progress chunked upload.
     */
    public function uploadStatus(ResolveChunkUploadRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $status = $this->fileService->getUploadStatus($validated['upload_id']);

        if (! $status) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }
}
