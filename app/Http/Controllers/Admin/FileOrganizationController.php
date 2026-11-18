<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Files\CopyFileAction;
use App\Actions\Files\QueueFileDuplicationAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\BulkFileActionRequest;
use App\Http\Requests\Admin\Files\CopyFileRequest;
use App\Http\Requests\Admin\Files\MoveFileRequest;
use App\Http\Requests\Admin\Files\RenameFileRequest;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\Files\FileFavoriteFlagService;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

/**
 * File manager copy, move, rename, and bulk actions over a selection of files.
 */
class FileOrganizationController extends Controller
{
    public function __construct(
        protected FileService $fileService,
        protected CopyFileAction $copyFile,
        protected QueueFileDuplicationAction $queueFileDuplication,
        protected FileFavoriteFlagService $fileFavoriteFlag,
    ) {}

    /**
     * Copy a file or folder synchronously or queue a background duplication job.
     */
    public function copy(CopyFileRequest $request, File $file): JsonResponse
    {
        $copied = $this->copyFile->execute($file, $request->validatedParentId(), $request->user()->id);

        if (is_string($copied)) {
            return $this->queuedDuplicationResponse($copied);
        }

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($copied, $request->user()?->id)))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Execute a bulk file action such as move, delete, tag, or copy.
     */
    public function bulk(BulkFileActionRequest $request): JsonResponse|Response
    {
        $validated = $request->validated();

        $ids = $validated['ids'];
        $parentId = $request->validatedParentId();

        return match ($validated['action']) {
            'move' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkMove($ids, $parentId)
                )->resolve(),
            ]),
            'copy' => $this->queuedDuplicationResponse(
                $this->queueFileDuplication->execute($request->user()->id, $ids, $parentId),
            ),
            'delete' => tap(response()->noContent(), fn () => $this->fileService->bulkSoftDelete($ids)),
            'restore' => tap(response()->noContent(), fn () => $this->fileService->bulkRestore($ids)),
            'force_delete' => tap(response()->noContent(), fn () => $this->fileService->bulkForceDelete($ids)),
            'favorite' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkFavorite($ids, $request->user(), true)
                )->resolve(),
            ]),
            'unfavorite' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkFavorite($ids, $request->user(), false)
                )->resolve(),
            ]),
            'tag' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkTag($ids, $validated['tags'] ?? [], true)
                )->resolve(),
            ]),
            'untag' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkTag($ids, $validated['tags'] ?? [], false)
                )->resolve(),
            ]),
        };
    }

    /**
     * Move a file or folder to another parent or disk.
     */
    public function move(MoveFileRequest $request, File $file): JsonResponse
    {
        $validated = $request->validated();

        $moved = $this->fileService->move(
            $file,
            $request->validatedParentId(),
            $validated['disk'] ?? null,
            isset($validated['version']) ? Carbon::parse($validated['version']) : null,
        );

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($moved->load('tags'), $request->user()?->id)))->response();
    }

    /**
     * Rename a file or folder.
     */
    public function rename(RenameFileRequest $request, File $file): JsonResponse
    {
        $validated = $request->validated();

        $renamed = $this->fileService->rename($file, $validated['name']);

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($renamed->load('tags'), $request->user()?->id)))->response();
    }

    /**
     * The 202 response for a duplication that runs in the background.
     */
    private function queuedDuplicationResponse(string $jobUuid): JsonResponse
    {
        return response()->json([
            'queued' => true,
            'job_id' => $jobUuid,
        ], 202);
    }
}
