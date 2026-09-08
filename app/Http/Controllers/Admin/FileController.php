<?php

namespace App\Http\Controllers\Admin;

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Enums\FileTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateFileMetadataRequest;
use App\Http\Resources\Admin\FileResource;
use App\Jobs\DuplicateFilesJob;
use App\Jobs\PrepareFilesZipJob;
use App\Models\File;
use App\Services\Files\FileWhereUsedScanner;
use App\Services\FileService;
use App\Services\FileTransformService;
use App\Services\Settings\ProjectSettings;
use App\Support\Uploads\UploadSizeLimiter;
use App\Support\Validation\SearchQueryRules;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Spatie\Tags\Tag;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * File manager HTTP API for browsing, uploading, transforming, and bulk-operating on files.
 */
class FileController extends Controller
{
    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = ['name', 'size', 'created_at', 'updated_at'];

    public function __construct(
        protected FileService $fileService,
        protected FileTransformService $fileTransformService,
        protected FileWhereUsedScanner $fileWhereUsedScanner,
    ) {}

    /**
     * On-demand scan of collection items that reference this file.
     */
    public function whereUsed(File $file): JsonResponse
    {
        $references = $this->fileWhereUsedScanner->findReferences((int) $file->id);

        return response()->json([
            'file_id' => (int) $file->id,
            'count' => count($references),
            'references' => $references,
        ]);
    }

    /**
     * Render the file manager index for a folder, bootstrapping page 1 for infinite scroll.
     *
     * Grid load-more always starts at page 1; subsequent pages use {@see list()}.
     */
    public function index(Request $request, ?int $folder = null): InertiaResponse|RedirectResponse
    {
        $parentId = null;

        if ($folder !== null) {
            $folderModel = File::query()->find($folder);

            if ($folderModel === null || ! $folderModel->isFolder()) {
                return redirect()->route(
                    'files.index',
                    collect($request->query())->except('parent_id')->all(),
                );
            }

            $parentId = $folderModel->id;
        }

        $validated = $request->validate([
            'trashed' => ['nullable', 'string', Rule::in(['only', 'with'])],
            'sort' => ['nullable', 'string', Rule::in(self::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer', 'min:1'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
        ]);

        $trashedFilter = $validated['trashed'] ?? null;
        $sort = $validated['sort'] ?? 'name';
        $direction = $validated['direction'] ?? 'asc';
        [$tagIds, $tagNames] = $this->resolveTagFilters($request);

        $paginator = $this->folderQuery(
            $request,
            $parentId,
            $trashedFilter,
            null,
            $tagIds,
            $tagNames,
            $sort,
            $direction,
        )
            ->paginate(50, ['*'], 'page', 1)
            ->withQueryString();

        $breadcrumbs = [];
        if ($parentId !== null) {
            $current = File::query()->find($parentId);
            while ($current !== null) {
                array_unshift($breadcrumbs, [
                    'id' => $current->id,
                    'name' => $current->name,
                ]);
                $current = $current->parent;
            }
        }

        return Inertia::render('admin/files/index', [
            'files' => [
                'data' => FileResource::collection($paginator->items())->resolve(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'parentId' => $parentId,
            'breadcrumbs' => $breadcrumbs,
            'filters' => [
                'trashed' => in_array($trashedFilter, ['only', 'with'], true) ? $trashedFilter : null,
                'tag_ids' => $tagIds,
                'sort' => $sort,
                'direction' => $direction,
            ],
        ]);
    }

    /**
     * Return a paginated JSON listing of files for load-more requests.
     */
    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'search' => SearchQueryRules::search(),
            'trashed' => ['nullable', 'string', Rule::in(['only', 'with'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'sort' => ['nullable', 'string', Rule::in(self::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer', 'min:1'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
            // ponytail: field inputs resolve selected file previews by id (no parent scope).
            'ids' => ['nullable', 'array', 'max:100'],
            'ids.*' => ['integer', 'min:1'],
        ]);

        $ids = collect($validated['ids'] ?? [])
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids !== []) {
            $userId = $request->user()?->id;
            $files = File::query()
                ->with(['tags', 'currentVersion'])
                ->whereIn('id', $ids)
                ->when(
                    $userId !== null,
                    fn (Builder $builder) => $builder->withExists([
                        'favoritedBy as is_favorited' => fn (Builder $favorite) => $favorite->where('user_id', $userId),
                    ]),
                )
                ->get()
                ->sortBy(static fn (File $file): int|false => array_search($file->id, $ids, true))
                ->values();

            return response()->json([
                'data' => FileResource::collection($files)->resolve(),
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => $files->count(),
                'total' => $files->count(),
            ]);
        }

        [$tagIds, $tagNames] = $this->resolveTagFilters($request);

        $paginator = $this->folderQuery(
            $request,
            $validated['parent_id'] ?? null,
            $validated['trashed'] ?? null,
            $validated['search'] ?? null,
            $tagIds,
            $tagNames,
            $validated['sort'] ?? 'name',
            $validated['direction'] ?? 'asc',
        )->paginate(50);

        return response()->json([
            'data' => FileResource::collection($paginator->items())->resolve(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ]);
    }

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
     * Create a folder in the file manager.
     */
    public function createFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
        ]);

        $folder = $this->fileService->createFolder(
            $validated['name'],
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
        );

        return (new FileResource($folder->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Upload a single file into the file manager.
     */
    public function upload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var UploadedFile $uploaded */
        $uploaded = $validated['file'];
        $size = (int) $uploaded->getSize();
        $maxBytes = app(ProjectSettings::class)->filesMaxUploadBytes();
        UploadSizeLimiter::assertWithinCap($maxBytes, $size);
        UploadSizeLimiter::assertFitsPhpSingleUpload($size);

        $file = $this->fileService->uploadFile(
            $uploaded,
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
            $validated['name'] ?? null,
        );

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Download a remote URL (SSRF-safe) and store it as a file manager asset.
     */
    public function importFromUrl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $url = trim($validated['url']);

        if ($ssrfError = SafeRemoteUrlValidator::validate($url)) {
            throw ValidationException::withMessages([
                'url' => [preg_replace('/^Error:\s*/', '', $ssrfError) ?: $ssrfError],
            ]);
        }

        $maxBytes = 25 * 1024 * 1024;

        try {
            $response = Http::timeout(30)
                ->connectTimeout(10)
                ->withOptions([
                    // ponytail: no redirects — avoids SSRF via Location to private IPs; upgrade: re-validate each hop
                    'allow_redirects' => false,
                    'http_errors' => false,
                ])
                ->withHeaders(['Accept' => '*/*'])
                ->get($url);
        } catch (\Throwable $exception) {
            throw ValidationException::withMessages([
                'url' => ['Failed to download URL: '.$exception->getMessage()],
            ]);
        }

        if ($response->status() >= 400) {
            throw ValidationException::withMessages([
                'url' => ['Remote server returned HTTP '.$response->status()],
            ]);
        }

        $contentLength = $response->header('Content-Length');

        if (is_numeric($contentLength) && (int) $contentLength > $maxBytes) {
            throw ValidationException::withMessages([
                'url' => ['Remote file is too large (max 25 MB).'],
            ]);
        }

        $body = $response->body();

        if ($body === '' || strlen($body) > $maxBytes) {
            throw ValidationException::withMessages([
                'url' => [$body === '' ? 'Remote file is empty.' : 'Remote file is too large (max 25 MB).'],
            ]);
        }

        $mime = $response->header('Content-Type') ?: 'application/octet-stream';
        $mime = strtolower(trim(explode(';', $mime)[0]));

        $pathName = parse_url($url, PHP_URL_PATH);
        $basename = is_string($pathName) ? basename($pathName) : '';
        $basename = $basename !== '' && $basename !== '/' ? $basename : 'download';
        $fileName = $validated['name'] ?? $basename;

        if (! pathinfo($fileName, PATHINFO_EXTENSION)) {
            $ext = match (true) {
                str_starts_with($mime, 'image/jpeg') => 'jpg',
                str_starts_with($mime, 'image/png') => 'png',
                str_starts_with($mime, 'image/gif') => 'gif',
                str_starts_with($mime, 'image/webp') => 'webp',
                str_starts_with($mime, 'image/svg') => 'svg',
                str_contains($mime, 'pdf') => 'pdf',
                default => null,
            };

            if ($ext !== null) {
                $fileName .= '.'.$ext;
            }
        }

        $tmpPath = tempnam(sys_get_temp_dir(), 'externa-import-');

        if ($tmpPath === false) {
            throw ValidationException::withMessages([
                'url' => ['Could not create a temporary file.'],
            ]);
        }

        try {
            file_put_contents($tmpPath, $body);

            $uploaded = new UploadedFile(
                $tmpPath,
                $fileName,
                $mime,
                null,
                true,
            );

            $file = $this->fileService->uploadFile(
                $uploaded,
                $validated['parent_id'] ?? null,
                'assets',
                $fileName,
            );
        } finally {
            if (is_file($tmpPath)) {
                @unlink($tmpPath);
            }
        }

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Update editable metadata for a file.
     */
    public function update(UpdateFileMetadataRequest $request, File $file): JsonResponse
    {
        $updated = $this->fileService->updateMetadata($file, $request->validated());

        return (new FileResource($this->withFavoriteFlag($updated, $request)))->response();
    }

    /**
     * Replace a file's binary content with a compatible upload.
     *
     *
     * @throws ValidationException
     */
    public function replace(Request $request, File $file): JsonResponse
    {
        if (! $file->isFile()) {
            throw ValidationException::withMessages([
                'file' => ['Only files can be replaced.'],
            ]);
        }

        $validated = $request->validate([
            'file' => ['required', 'file'],
        ]);

        /** @var UploadedFile $upload */
        $upload = $validated['file'];
        $this->assertCompatibleReplaceUpload($file, $upload);

        $replaced = $this->fileService->replaceFile($file, $upload);

        return (new FileResource($this->withFavoriteFlag($replaced, $request)))->response();
    }

    /**
     * Copy a file or folder synchronously or queue a background duplication job.
     */
    public function copy(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
        ]);

        $targetParentId = $validated['parent_id'] ?? null;

        if ($this->shouldDuplicateSynchronously($file)) {
            $copied = $this->fileService->copy($file, $targetParentId);

            return (new FileResource($this->withFavoriteFlag($copied, $request)))
                ->response()
                ->setStatusCode(201);
        }

        return $this->queueDuplicate($request, [$file->id], $targetParentId);
    }

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

    /**
     * Replace the tag set attached to a file.
     */
    public function syncTags(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'tags' => ['present', 'array'],
            'tags.*' => ['string', 'max:100'],
        ]);

        $updated = $this->fileService->syncTags($file, $validated['tags']);

        return (new FileResource($this->withFavoriteFlag($updated, $request)))->response();
    }

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
     */
    public function thumbnail(Request $request, File $file): StreamedResponse|Response
    {
        if (! $this->fileTransformService->isImage($file)) {
            abort(422, 'Thumbnails are only available for image files.');
        }

        $validated = $request->validate([
            'size' => ['nullable', 'integer', 'min:1', 'max:'.$this->fileTransformService->maxSize()],
            'key' => ['nullable', 'string', 'max:64'],
        ]);

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
    public function downloadMany(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:files,id'],
        ]);

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

    /**
     * Execute a bulk file action such as move, delete, tag, or copy.
     */
    public function bulk(Request $request): JsonResponse|Response
    {
        $validated = $request->validate([
            'action' => ['required', 'string', Rule::in([
                'move',
                'delete',
                'restore',
                'force_delete',
                'favorite',
                'unfavorite',
                'tag',
                'untag',
                'copy',
            ])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
        ]);

        $ids = $validated['ids'];

        return match ($validated['action']) {
            'move' => response()->json([
                'data' => FileResource::collection(
                    $this->fileService->bulkMove($ids, $validated['parent_id'] ?? null)
                )->resolve(),
            ]),
            'copy' => $this->queueDuplicate($request, $ids, $validated['parent_id'] ?? null),
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
    public function move(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
            'version' => ['nullable', 'date'],
        ]);

        $moved = $this->fileService->move(
            $file,
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? null,
            isset($validated['version']) ? Carbon::parse($validated['version']) : null,
        );

        return (new FileResource($this->withFavoriteFlag($moved->load('tags'), $request)))->response();
    }

    /**
     * Rename a file or folder.
     */
    public function rename(Request $request, File $file): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $renamed = $this->fileService->rename($file, $validated['name']);

        return (new FileResource($this->withFavoriteFlag($renamed->load('tags'), $request)))->response();
    }

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
     * Attach a file to a polymorphic model with optional role and order.
     */
    public function attach(Request $request, File $file): Response
    {
        $validated = $request->validate([
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
            'role' => ['nullable', 'string', 'max:255'],
            'order' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->fileService->attachToModel(
            $file,
            $validated['model_type'],
            $validated['model_id'],
            $validated['role'] ?? null,
            $validated['order'] ?? 0,
        );

        return response()->noContent();
    }

    /**
     * Detach a file from a polymorphic model.
     */
    public function detach(Request $request, File $file): Response
    {
        $validated = $request->validate([
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
            'role' => ['nullable', 'string', 'max:255'],
        ]);

        $this->fileService->detachFromModel(
            $file,
            $validated['model_type'],
            $validated['model_id'],
            $validated['role'] ?? null,
        );

        return response()->noContent();
    }

    /**
     * Initialize a resumable chunked upload session.
     */
    public function initChunkUpload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'total_size' => ['required', 'integer', 'min:1'],
            'total_chunks' => ['required', 'integer', 'min:1'],
            'mime_type' => ['nullable', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
        ]);

        UploadSizeLimiter::assertWithinCap(
            app(ProjectSettings::class)->filesMaxUploadBytes(),
            (int) $validated['total_size'],
            'total_size',
        );

        $fileUpload = $this->fileService->initChunkUpload(
            $validated['file_name'],
            $validated['total_size'],
            $validated['total_chunks'],
            $validated['mime_type'] ?? null,
            $validated['parent_id'] ?? null,
            $validated['disk'] ?? 'assets',
        );

        return response()->json([
            'upload_id' => $fileUpload->upload_id,
            'expires_at' => $fileUpload->expires_at->toIso8601String(),
        ], 201);
    }

    /**
     * Upload one chunk for an in-progress resumable upload.
     */
    public function uploadChunk(Request $request): Response
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
            'chunk_index' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file'],
        ]);

        $this->fileService->uploadChunk(
            $validated['upload_id'],
            $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    /**
     * Finalize a chunked upload and create the file record.
     */
    public function completeChunkUpload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $file = $this->fileService->completeChunkUpload($validated['upload_id']);

        return (new FileResource($file->load('tags')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Return progress metadata for an in-progress chunked upload.
     */
    public function uploadStatus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $status = $this->fileService->getUploadStatus($validated['upload_id']);

        if (! $status) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }

    /**
     * Build the folder listing query with trash, search, tag, and sort behavior.
     *
     * Flat trash shows every soft-deleted item regardless of folder; active views stay scoped
     * to the current parent. Tag filters match any selected tag (OR). Results order folders
     * before files, then the requested sort, then id.
     *
     * @param  list<int>  $tagIds
     * @param  list<string>  $tagNames
     * @return Builder<File>
     */
    protected function folderQuery(
        Request $request,
        ?int $parentId,
        ?string $trashedFilter = null,
        ?string $search = null,
        array $tagIds = [],
        array $tagNames = [],
        string $sort = 'name',
        string $direction = 'asc',
    ): Builder {
        $userId = $request->user()?->id;
        $sortColumn = in_array($sort, self::SORTABLE_COLUMNS, true) ? $sort : 'name';
        $sortDirection = $direction === 'desc' ? 'desc' : 'asc';

        $query = File::query()
            ->with('tags')
            ->when(
                $trashedFilter === 'only',
                fn (Builder $builder) => $builder->onlyTrashed(),
            )
            ->when(
                $trashedFilter === 'with',
                fn (Builder $builder) => $builder->withTrashed(),
            )
            ->when(
                $trashedFilter !== 'only',
                fn (Builder $builder) => $builder->when(
                    $parentId,
                    fn (Builder $scoped) => $scoped->where('parent_id', $parentId),
                    fn (Builder $scoped) => $scoped->whereNull('parent_id'),
                ),
            )
            ->when($search, function (Builder $builder) use ($search) {
                $searchTerm = '%'.strtolower($search).'%';
                $builder->where(function (Builder $inner) use ($searchTerm) {
                    $inner->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                        ->orWhereRaw('LOWER(path) LIKE ?', [$searchTerm])
                        ->orWhereRaw('LOWER(title) LIKE ?', [$searchTerm]);
                });
            })
            ->when($tagIds !== [], function (Builder $builder) use ($tagIds) {
                $builder->whereHas(
                    'tags',
                    fn (Builder $tagQuery) => $tagQuery->whereIn(File::getTagTablePrimaryKeyName(), $tagIds),
                );
            })
            ->when($tagIds === [] && $tagNames !== [], function (Builder $builder) use ($tagNames) {
                $builder->withAnyTags($tagNames);
            })
            ->with('currentVersion');

        if ($userId !== null) {
            $query->withExists([
                'favoritedBy as is_favorited' => fn (Builder $builder) => $builder->where('user_id', $userId),
            ])->orderByDesc('is_favorited');
        }

        return $query
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy($sortColumn, $sortDirection)
            ->orderBy('id');
    }

    /**
     * Normalize tag id and name filters from the request payload.
     *
     * @return array{0: list<int>, 1: list<string>}
     */
    protected function resolveTagFilters(Request $request): array
    {
        $tagIds = collect($request->input('tag_ids', []))
            ->map(static fn (mixed $tagId): int => (int) $tagId)
            ->filter(static fn (int $tagId): bool => $tagId > 0)
            ->unique()
            ->values()
            ->all();

        $tagNames = collect($request->input('tags', []))
            ->map(static fn (mixed $tagName): string => trim((string) $tagName))
            ->filter(static fn (string $tagName): bool => $tagName !== '')
            ->unique()
            ->values()
            ->all();

        return [$tagIds, $tagNames];
    }

    /**
     * Ensure a replacement upload matches the stored file extension or mime family.
     *
     * ponytail: when no stored/name extension exists, fall back to mime family (image/*, text/*, …).
     *
     *
     * @throws ValidationException
     */
    protected function assertCompatibleReplaceUpload(File $file, UploadedFile $upload): void
    {
        $expectedExtension = $this->normalizeExtension(
            $file->extension ?: pathinfo($file->name, PATHINFO_EXTENSION),
        );
        $uploadedExtension = $this->normalizeExtension(
            pathinfo($upload->getClientOriginalName(), PATHINFO_EXTENSION),
        );

        if ($expectedExtension !== null) {
            if ($uploadedExtension !== $expectedExtension) {
                throw ValidationException::withMessages([
                    'file' => ["Replacement must use the .{$expectedExtension} extension."],
                ]);
            }

            return;
        }

        $expectedMime = $file->mime_type;
        $uploadedMime = $upload->getMimeType();

        if ($expectedMime === null || $expectedMime === '' || $uploadedMime === null || $uploadedMime === '') {
            return;
        }

        $expectedFamily = strtolower(explode('/', $expectedMime, 2)[0]);
        $uploadedFamily = strtolower(explode('/', $uploadedMime, 2)[0]);

        if ($expectedFamily !== '' && $expectedFamily !== $uploadedFamily) {
            throw ValidationException::withMessages([
                'file' => ["Replacement must be a {$expectedFamily} file."],
            ]);
        }
    }

    /**
     * Normalize a file extension for comparison, returning null when empty.
     */
    protected function normalizeExtension(?string $extension): ?string
    {
        $normalized = strtolower(ltrim(trim((string) $extension), '.'));

        return $normalized === '' ? null : $normalized;
    }

    /**
     * Load tags and set the favorite flag for the current user when present.
     */
    protected function withFavoriteFlag(File $file, Request $request): File
    {
        $userId = $request->user()?->id;
        $file->loadMissing('tags');

        if ($userId !== null) {
            $file->is_favorited = $file->favoritedBy()->where('user_id', $userId)->exists();
        }

        return $file;
    }

    /**
     * Decide whether a single non-folder file should duplicate synchronously.
     */
    protected function shouldDuplicateSynchronously(File $file): bool
    {
        if ($file->isFolder()) {
            return false;
        }

        $maxBytes = (int) config('files.duplicate_sync_max_bytes', 52_428_800);

        return ($file->size ?? 0) <= $maxBytes;
    }

    /**
     * Queue a background duplication job for one or more files.
     *
     * @param  list<int>  $fileIds
     */
    protected function queueDuplicate(Request $request, array $fileIds, ?int $targetParentId): JsonResponse
    {
        $jobUuid = (string) Str::uuid();

        DuplicateFilesJob::dispatch(
            $request->user()->id,
            array_values(array_map(static fn (mixed $fileId): int => (int) $fileId, $fileIds)),
            $targetParentId,
            $jobUuid,
        );

        return response()->json([
            'queued' => true,
            'job_id' => $jobUuid,
        ], 202);
    }
}
