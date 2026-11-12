<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\UserContentResponse;
use App\Models\File;
use App\Services\FileTransformService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public CMS API: stream a file's original bytes or an image transform, gated by file_permissions.
 */
class FileContentController extends Controller
{
    public function __construct(
        private FileTransformService $fileTransformService,
    ) {}

    public function content(Request $request, int $id): StreamedResponse|Response
    {
        $file = File::query()->find($id);
        if ($file === null || ! $file->isFile() || ! $file->storage_path) {
            abort(404);
        }

        Gate::authorize('view', $file);

        if (! Storage::disk($file->disk)->exists($file->storage_path)) {
            abort(404);
        }

        return UserContentResponse::fromDisk(
            Storage::disk($file->disk),
            $file->storage_path,
            $file->downloadFilename(),
            $file->mime_type,
            [
                'Cache-Control' => 'private, max-age=3600',
            ],
        );
    }

    public function transform(Request $request, int $id, string $key): StreamedResponse|Response
    {
        $file = File::query()->find($id);
        if ($file === null || ! $this->fileTransformService->isImage($file)) {
            abort(404);
        }

        Gate::authorize('view', $file);

        try {
            if (preg_match('/^size-(\d+)$/', $key, $matches) === 1) {
                $cachePath = $this->fileTransformService->ensureThumbnail($file, (int) $matches[1]);
            } else {
                $cachePath = $this->fileTransformService->ensureTransform($file, key: $key);
            }
        } catch (\Throwable) {
            abort(404);
        }

        $transformMime = $this->fileTransformService->mimeForPath($cachePath);

        return UserContentResponse::fromDisk(
            Storage::disk($file->disk),
            $cachePath,
            basename($cachePath),
            $transformMime,
            [
                'Cache-Control' => 'private, max-age=86400',
            ],
        );
    }
}
