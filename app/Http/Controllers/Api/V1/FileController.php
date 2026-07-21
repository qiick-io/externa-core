<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\FilePermissionAction;
use App\Enums\FileTypeEnum;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesFileAccess;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\FileResource;
use App\Models\File;
use App\Services\FileService;
use App\Services\FileTransformService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public CMS API: file list/metadata/content/transforms gated by file_permissions.
 */
class FileController extends Controller
{
    use AuthorizesFileAccess;

    public function __construct(
        private FileService $fileService,
        private FileTransformService $fileTransformService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeFile($request, FilePermissionAction::Read);

        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $perPage = min(max((int) ($validated['per_page'] ?? 15), 1), 100);
        $parentId = isset($validated['parent_id']) ? (int) $validated['parent_id'] : null;
        $search = $validated['search'] ?? null;

        $paginator = $this->listQuery($parentId, $search)->paginate($perPage);

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
        $this->authorizeFile($request, FilePermissionAction::Read);

        $file = File::query()->find($id);
        if ($file === null) {
            abort(404);
        }

        return response()->json([
            'data' => (new FileResource($file))->toArray($request),
        ]);
    }

    public function content(Request $request, int $id): StreamedResponse|Response
    {
        $this->authorizeFile($request, FilePermissionAction::Read);

        $file = File::query()->find($id);
        if ($file === null || ! $file->isFile() || ! $file->storage_path) {
            abort(404);
        }

        if (! Storage::disk($file->disk)->exists($file->storage_path)) {
            abort(404);
        }

        return Storage::disk($file->disk)->response(
            $file->storage_path,
            $file->downloadFilename(),
            [
                'Content-Type' => $file->mime_type ?? 'application/octet-stream',
                'Cache-Control' => 'private, max-age=3600',
            ],
        );
    }

    public function transform(Request $request, int $id, string $key): StreamedResponse|Response
    {
        $this->authorizeFile($request, FilePermissionAction::Read);

        $file = File::query()->find($id);
        if ($file === null || ! $this->fileTransformService->isImage($file)) {
            abort(404);
        }

        try {
            if (preg_match('/^size-(\d+)$/', $key, $matches) === 1) {
                $cachePath = $this->fileTransformService->ensureThumbnail($file, (int) $matches[1]);
            } else {
                $cachePath = $this->fileTransformService->ensureTransform($file, key: $key);
            }
        } catch (\Throwable) {
            abort(404);
        }

        return Storage::disk($file->disk)->response($cachePath, null, [
            'Content-Type' => $this->fileTransformService->mimeForPath($cachePath),
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeFile($request, FilePermissionAction::Create);

        $validated = $request->validate([
            'file' => ['required', 'file'],
            'parent_id' => ['nullable', 'integer', 'exists:files,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'disk' => ['nullable', 'string', Rule::in(['assets'])],
        ]);

        /** @var UploadedFile $upload */
        $upload = $validated['file'];

        $file = $this->fileService->uploadFile(
            $upload,
            isset($validated['parent_id']) ? (int) $validated['parent_id'] : null,
            $validated['disk'] ?? 'assets',
            $validated['name'] ?? null,
        );

        return response()->json([
            'data' => (new FileResource($file))->toArray($request),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorizeFile($request, FilePermissionAction::Update);

        $file = File::query()->find($id);
        if ($file === null) {
            abort(404);
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'download_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'focal_point_x' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            'focal_point_y' => ['sometimes', 'nullable', 'numeric', 'between:0,1'],
            'name' => ['sometimes', 'string', 'max:255'],
        ]);

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
        $this->authorizeFile($request, FilePermissionAction::Delete);

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
                    $inner->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                        ->orWhereRaw('LOWER(path) LIKE ?', [$searchTerm])
                        ->orWhereRaw('LOWER(title) LIKE ?', [$searchTerm]);
                });
            })
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [FileTypeEnum::Folder->value])
            ->orderBy('name')
            ->orderBy('id');
    }
}
