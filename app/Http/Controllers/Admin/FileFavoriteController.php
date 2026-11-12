<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * File manager favorites of the signed-in user.
 */
class FileFavoriteController extends Controller
{
    public function __construct(
        protected FileService $fileService,
    ) {}

    /**
     * Mark a file as favorited for the authenticated user.
     */
    public function favorite(Request $request, File $file): JsonResponse
    {
        $this->fileService->favorite($file, $request->user());

        $file->load('tags');
        $file->is_favorited = true;

        return (new FileResource($file))->response();
    }

    /**
     * Remove a file from the authenticated user's favorites.
     */
    public function unfavorite(Request $request, File $file): JsonResponse
    {
        $this->fileService->unfavorite($file, $request->user());

        $file->load('tags');
        $file->is_favorited = false;

        return (new FileResource($file))->response();
    }
}
