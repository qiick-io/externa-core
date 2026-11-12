<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\SyncFileTagsRequest;
use App\Http\Resources\Admin\FileResource;
use App\Models\File;
use App\Services\Files\FileFavoriteFlagService;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Spatie\Tags\Tag;

/**
 * File manager tags: the global tag catalog and a file's tag set.
 */
class FileTagController extends Controller
{
    public function __construct(
        protected FileService $fileService,
        protected FileFavoriteFlagService $fileFavoriteFlag,
    ) {}

    /**
     * Return the global tag catalog used by the file picker and tag filter.
     */
    public function listTags(): JsonResponse
    {
        $tags = Tag::query()
            ->ordered()
            ->get()
            ->map(static fn (Tag $tag): array => [
                'id' => $tag->id,
                'name' => (string) $tag->name,
                'slug' => (string) $tag->slug,
            ])
            ->values()
            ->all();

        return response()->json($tags);
    }

    /**
     * Replace the tag set attached to a file.
     */
    public function syncTags(SyncFileTagsRequest $request, File $file): JsonResponse
    {
        $validated = $request->validated();

        $updated = $this->fileService->syncTags($file, $validated['tags']);

        return (new FileResource($this->fileFavoriteFlag->withFavoriteFlag($updated, $request->user()?->id)))->response();
    }
}
