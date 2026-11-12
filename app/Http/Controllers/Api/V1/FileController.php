<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\FileTypeEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccessTrait;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListFilesRequest;
use App\Http\Requests\Api\V1\StoreFileRequest;
use App\Http\Requests\Api\V1\UpdateFileRequest;
use App\Http\Resources\Api\V1\FileResource;
use App\Http\Responses\UserContentResponse;
use App\Models\File;
use App\Services\Api\FilePermissionGuardService;
use App\Services\Files\FilesDiskService;
use App\Services\FileService;
use App\Services\FileTransformService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public CMS API: file list/metadata/content/transforms gated by file_permissions.
 */
class FileController extends Controller
{
    use AuthorizesFileAccessTrait;

    public function __construct(
        private FileService $fileService,
        private FileTransformService $fileTransformService,
    ) {}

    public function index(ListFilesRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $maxPerPage = max(1, (int) config('api.max_per_page', 100));
        $perPage = min(max((int) ($validated['per_page'] ?? 15), 1), $maxPerPage);
        $parentId = isset($validated['parent_id']) ? (int) $validated['parent_id'] : null;
        $search = $validated['search'] ?? null;

        $query = $this->listQuery($parentId, $search);
        $query = app(FilePermissionGuardService::class)->constrainReadable(
            $query,
            $this->apiAccess($request)->roleId(),
        );

        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => FileResource::collection($paginator->items())->resolve(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $file = File::query()->find($id);
        if ($file === null) {
            abort(404);
        }

        Gate::authorize('view', $file);

        return response()->json([
            'data' => (new FileResource($file))->toArray($request),
        ]);
    }

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

    public function store(StoreFileRequest $request): JsonResponse
    {
        $validated = $request->validated();

        /** @var UploadedFile $upload */
        $upload = $validated['file'];

        $file = $this->fileService->uploadFile(
            $upload,
            isset($validated['parent_id']) ? (int) $validated['parent_id'] : null,
            $validated['disk'] ?? FilesDiskService::default(),
            $validated['name'] ?? null,
        );

        return response()->json([
            'data' => (new FileResource($file))->toArray($request),
        ], 201);
    }

    public function update(UpdateFileRequest $request, int $id): JsonResponse
    {
        $file = $request->targetFile();
        $validated = $request->validated();

        if (array_key_exists('name', $validated) && $validated['name'] !== $file->name) {
            $file = $this->fileService->rename($file, $validated['name']);
            unset($validated['name']);
        }

        if ($validated !== []) {
            $file = $this->fileService->updateMetadata($file, $validated);
        }

        return response()->json([
            'data' => (new FileResource($file))->toArray($request),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        Gate::authorize('delete', File::class);

        $file = File::query()->find($id);
        if ($file === null) {
            abort(404);
        }

        $this->fileService->softDelete($file);

        return response()->json(null, 204);
    }

    /**
     * @return Builder<File>
     */
    private function listQuery(?int $parentId, ?string $search): Builder
    {
        return File::query()
            ->when(
                $parentId,
                fn (Builder $scoped) => $scoped->where('parent_id', $parentId),
                fn (Builder $scoped) => $scoped->whereNull('parent_id'),
            )
            ->when($search, function (Builder $builder) use ($search) {
                $searchTerm = '%'.strtolower((string) $search).'%';
                $builder->where(function (Builder $inner) use ($searchTerm) {
                    // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                    $inner->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                        // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                        ->orWhereRaw('LOWER(path) LIKE ?', [$searchTerm])
                        // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
                        ->orWhereRaw('LOWER(title) LIKE ?', [$searchTerm]);
                });
            })
            // raw-sql: reviewed — search term bound; folder-first ORDER BY uses bound enum
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy('name')
            ->orderBy('id');
    }
}
