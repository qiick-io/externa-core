<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\FileResource;
use App\Jobs\EmptyFilesTrashJob;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/**
 * File manager trash: soft delete, restore, permanent delete, and emptying the trash.
 */
class FileTrashController extends Controller
{
    public function __construct(
        protected FileService $fileService,
    ) {}

    /**
     * Soft-delete a file or folder.
     */
    public function destroy(File $file): Response
    {
        $this->fileService->softDelete($file);

        return response()->noContent();
    }

    /**
     * Restore a soft-deleted file or folder.
     */
    public function restore(int $file): JsonResponse
    {
        $fileModel = File::query()->onlyTrashed()->findOrFail($file);

        $restored = $this->fileService->restore($fileModel);

        return (new FileResource($restored->load('tags')))->response();
    }

    /**
     * Permanently delete a file or folder.
     */
    public function forceDelete(int $file): Response
    {
        $fileModel = File::query()->withTrashed()->findOrFail($file);

        $this->fileService->forceDelete($fileModel);

        return response()->noContent();
    }

    /**
     * Queue a background job that permanently deletes everything in the trash.
     * The requester gets a database notification when it finishes.
     */
    public function emptyTrash(Request $request): JsonResponse
    {
        $jobUuid = (string) Str::uuid();

        EmptyFilesTrashJob::dispatch($request->user()->id, $jobUuid);

        return response()->json([
            'queued' => true,
            'job_id' => $jobUuid,
        ], 202);
    }
}
