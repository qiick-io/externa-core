<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Files\ImportFileFromUrlAction;
use App\Actions\Files\ReplaceFileAction;
use App\Actions\Files\UploadFileAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\ImportFileFromUrlRequest;
use App\Http\Requests\Admin\Files\ReplaceFileRequest;
use App\Http\Requests\Admin\Files\UploadFileRequest;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\Files\FileFavoriteFlagService;
use App\Services\Files\FilesDiskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * File manager single-request uploads: new files, imports from a URL and replacements.
 *
 * Resumable uploads are in {@see FileChunkUploadController}.
 */
class FileUploadController extends Controller
{
    public function __construct(
        protected UploadFileAction $uploadFile,
        protected ImportFileFromUrlAction $importFileFromUrl,
        protected ReplaceFileAction $replaceFile,
        protected FileFavoriteFlagService $fileFavoriteFlag,
    ) {}

    /**
     * Upload a single file into the file manager.
     */
    public function upload(UploadFileRequest $request): JsonResponse
    {
        $validated = $request->validated();

        /** @var UploadedFile $uploaded */
        $uploaded = $validated['file'];

        $file = $this->uploadFile->execute(
            $uploaded,
            $request->validatedParentId(),
            $validated['disk'] ?? FilesDiskService::default(),
            $validated['name'] ?? null,
        );

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Download a remote URL (SSRF-safe) and store it as a file manager asset.
     */
    public function importFromUrl(ImportFileFromUrlRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $file = $this->importFileFromUrl->execute(
            $validated['url'],
            $validated['name'] ?? null,
            $request->validatedParentId(),
        );

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Replace a file's binary content with a compatible upload.
     *
     * Folder targets are rejected by {@see ReplaceFileRequest} before validation.
     *
     * @throws ValidationException
     */
    public function replace(ReplaceFileRequest $request, File $file): JsonResponse
    {
        $validated = $request->validated();

        /** @var UploadedFile $upload */
        $upload = $validated['file'];

        $replaced = $this->replaceFile->execute($file, $upload);

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($replaced, $request->user()?->id)))->response();
    }
}
