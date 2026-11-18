<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Files\DownloadFilesRequest;
use App\Http\Requests\Admin\Files\ShowFileThumbnailRequest;
use App\Jobs\PrepareFilesZipJob;
use App\Models\File;
use App\Services\FileService;
use App\Services\FileTransformService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * File manager downloads: single files, image thumbnails, and queued zip archives.
 */
class FileDownloadController extends Controller
{
    public function __construct(
        protected FileService $fileService,
        protected FileTransformService $fileTransformService,
    ) {}

    /**
     * Stream a file download from storage.
     */
    public function download(File $file): StreamedResponse|Response
    {
        if (! $file->isFile() || ! $file->storage_path || ! Storage::disk($file->disk)->exists($file->storage_path)) {
            abort(404);
        }

        return Storage::disk($file->disk)->download(
            $file->storage_path,
            $file->downloadFilename(),
        );
    }

    /**
     * Stream a generated thumbnail for an image file.
     *
     * Non-image files are rejected with 422 by {@see ShowFileThumbnailRequest} before validation.
     */
    public function thumbnail(ShowFileThumbnailRequest $request, File $file): StreamedResponse|Response
    {
        $validated = $request->validated();

        try {
            $cachePath = isset($validated['key'])
                ? $this->fileTransformService->ensureTransform($file, key: $validated['key'])
                : $this->fileTransformService->ensureThumbnail(
                    $file,
                    isset($validated['size']) ? (int) $validated['size'] : null,
                );
        } catch (\Throwable) {
            abort(404);
        }

        return Storage::disk($file->disk)->response($cachePath, null, [
            'Content-Type' => $this->fileTransformService->mimeForPath($cachePath),
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    /**
     * Queue a background job to zip and prepare multiple files for download.
     */
    public function downloadMany(DownloadFilesRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $jobUuid = (string) Str::uuid();

        PrepareFilesZipJob::dispatch(
            $request->user()->id,
            array_values(array_map(static fn (mixed $fileId): int => (int) $fileId, $validated['ids'])),
            $jobUuid,
        );

        return response()->json([
            'queued' => true,
            'job_id' => $jobUuid,
        ], 202);
    }

    /**
     * Download a prepared zip archive and delete it after sending.
     */
    public function downloadPreparedZip(Request $request, string $jobId): BinaryFileResponse
    {
        if (! preg_match('/^[0-9a-fA-F-]{36}$/', $jobId)) {
            abort(404);
        }

        $zipPath = $this->fileService->zipStoragePath($request->user()->id, $jobId);

        if (! is_file($zipPath)) {
            abort(404);
        }

        $ttlMinutes = (int) config('files.zip_ttl_minutes', 60);
        $modifiedAt = filemtime($zipPath);

        if ($modifiedAt !== false && $modifiedAt < now()->subMinutes($ttlMinutes)->getTimestamp()) {
            @unlink($zipPath);
            abort(410);
        }

        return response()->download($zipPath, 'files.zip')->deleteFileAfterSend(true);
    }
}
